/**
 * Africa's Talking SMS service for Digital MIPC EDU.
 *
 * Responsibilities:
 *  - Validate + normalise Rwandan phone numbers to E.164 (+2507XXXXXXXX).
 *  - Send live SMS via the Africa's Talking Node.js SDK when AT_API_KEY and
 *    AT_USERNAME are configured.
 *  - Fall back gracefully to DB-only logging (status LOGGED_ONLY) when
 *    credentials are missing or the SDK cannot deliver (sandbox mode, no credit…).
 *  - Record every attempt in the `sms_logs` PostgreSQL table.
 */
const pool = require('../config/database');

const VALID_TYPES = new Set([
  'CHECK_IN', 'CHECK_OUT', 'GATE_PASS', 'VISITE_DAY', 'ANNOUNCEMENT',
]);
const VALID_STATUSES = new Set(['SENT', 'FAILED', 'LOGGED_ONLY']);

let atClient = null;
let atSms = null;

function initAfricasTalking() {
  if (atClient) return atClient;
  try {
    const africastalking = require('africastalking');
    atClient = africastalking({
      apiKey: process.env.AT_API_KEY,
      username: process.env.AT_USERNAME || 'sandbox',
    });
    atSms = atClient.SMS;
  } catch (err) {
    console.error('[SMS_SERVICE] africastalking SDK unavailable:', err.message);
    atClient = null;
  }
  return atClient;
}

/**
 * Are live credentials configured? Sandbox mode (username === 'sandbox')
 * still sends through Africa's Talking but is treated as non-production:
 * messages are marked LOGGED_ONLY unless explicitly forced live.
 */
function isLiveConfig() {
  return Boolean(process.env.AT_API_KEY && process.env.AT_USERNAME);
}

function isSandboxMode() {
  return (process.env.AT_USERNAME || '').trim().toLowerCase() === 'sandbox';
}

/**
 * Normalise a raw phone value to E.164 for Rwanda (+2507XXXXXXXX).
 * Accepts: 07X..., +2507X..., 2507X..., 7X... (local), and stray spaces/dashes.
 * Returns { ok: true, e164 } or { ok: false, reason }.
 */
function formatRwandanPhone(raw) {
  if (!raw) return { ok: false, reason: 'Phone number is missing.' };
  let digits = String(raw).replace(/[\s\-().]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  if (digits.startsWith('00')) digits = digits.slice(2);

  if (/^2507\d{8}$/.test(digits)) return { ok: true, e164: `+${digits}` }; // 250 + 7XXXXXXXX
  if (/^07\d{8}$/.test(digits)) return { ok: true, e164: `+250${digits.slice(1)}` };
  if (/^7\d{8}$/.test(digits)) return { ok: true, e164: `+250${digits}` };
  if (/^0?7\d{8}$/.test(digits) === false && /^25\d{11}$/.test(digits)) {
    // Other country code passthrough (rare) — keep as-is if plausible.
    return { ok: true, e164: `+${digits}` };
  }
  return { ok: false, reason: `Not a valid Rwandan phone number: ${raw}` };
}

/**
 * Persist one attempt in sms_logs.
 */
async function logAttempt({ studentId, recipientPhone, recipientName, recipientRole, messageBody, notificationType, status, providerResponse, sentBy }) {
  const type = VALID_TYPES.has(notificationType) ? notificationType : 'ANNOUNCEMENT';
  const finalStatus = VALID_STATUSES.has(status) ? status : 'LOGGED_ONLY';
  let responseJson;
  if (providerResponse !== undefined && providerResponse !== null) {
    if (typeof providerResponse === 'string') responseJson = providerResponse;
    else {
      try { responseJson = JSON.stringify(providerResponse); } catch { responseJson = String(providerResponse); }
    }
  }
  const result = await pool.query(
    `INSERT INTO sms_logs
       (student_id, recipient_phone, recipient_name, recipient_role,
        message_body, notification_type, status, provider_response, sent_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::JSONB, $9)
     RETURNING *;`,
    [studentId || null, recipientPhone || '', recipientName || '', recipientRole || 'parent',
    messageBody || '', type, finalStatus, responseJson, sentBy || 'system']
  );
  return result.rows[0];
}

/**
 * Core service: send (or log-only) one SMS and record the attempt.
 *
 * @param {object} options
 * @param {string} options.to          Raw phone number (any Rwandan format)
 * @param {string} options.message     Message body
 * @param {number|null} [options.studentId]
 * @param {string} [options.type]      CHECK_IN | CHECK_OUT | GATE_PASS | VISITE_DAY | ANNOUNCEMENT
 * @param {string} [options.recipientName]
 * @param {string} [options.recipientRole] 'parent' | 'staff'
 * @param {string} [options.sentBy]    Actor name/username for the audit trail
 * @returns {{ logged, status, providerResponse, logId }}
 */
async function sendSMS({ to, message, studentId = null, type = 'ANNOUNCEMENT', recipientName = '', recipientRole = 'parent', sentBy = 'system' }) {
  const normalized = formatRwandanPhone(to);
  if (!normalized.ok) {
    const log = await logAttempt({
      studentId, recipientPhone: to || '', recipientName, recipientRole,
      messageBody: message, notificationType: type, status: 'FAILED',
      providerResponse: { error: normalized.reason }, sentBy,
    });
    return { logged: true, status: 'FAILED', providerResponse: { error: normalized.reason }, logId: log.id };
  }

  const phone = normalized.e164;
  const notificationType = VALID_TYPES.has(type) ? type : 'ANNOUNCEMENT';

  // Fallback path: no credentials, or sandbox mode without force-live flag.
  const sandboxFallback = isSandboxMode() && process.env.AT_FORCE_LIVE !== 'true';
  if (!isLiveConfig() || sandboxFallback) {
    const reason = !isLiveConfig()
      ? 'AT_API_KEY / AT_USERNAME not configured — message logged only.'
      : 'Sandbox mode — message logged only (set AT_FORCE_LIVE=true to send).';
    console.warn(`[SMS_SERVICE] ${reason}`);
    const log = await logAttempt({
      studentId, recipientPhone: phone, recipientName, recipientRole,
      messageBody: message, notificationType, status: 'LOGGED_ONLY',
      providerResponse: { logged_only: true, reason }, sentBy,
    });
    return { logged: true, status: 'LOGGED_ONLY', providerResponse: { reason }, logId: log.id };
  }

  // Live send via Africa's Talking SDK.
  initAfricasTalking();
  if (!atSms) {
    const log = await logAttempt({
      studentId, recipientPhone: phone, recipientName, recipientRole,
      messageBody: message, notificationType, status: 'FAILED',
      providerResponse: { error: 'Africa\u2019s Talking SDK could not be initialised.' }, sentBy,
    });
    return { logged: true, status: 'FAILED', providerResponse: { error: 'SDK unavailable' }, logId: log.id };
  }

  const payload = { to: [phone], message, enqueued: true };
  if (process.env.AT_SENDER_ID) payload.from = process.env.AT_SENDER_ID;

  try {
    const response = await atSms.send(payload);
    const first = response?.SMSMessageData?.Recipients?.[0] || {};
    const delivered = String(first.status || '').toLowerCase() === 'success';
    const status = delivered ? 'SENT' : 'FAILED';
    const log = await logAttempt({
      studentId, recipientPhone: phone, recipientName, recipientRole,
      messageBody: message, notificationType, status,
      providerResponse: response, sentBy,
    });
    return { logged: true, status, providerResponse: response, logId: log.id };
  } catch (err) {
    console.error('[SMS_SERVICE] Africa\u2019s Talking send failed:', err.message);
    const log = await logAttempt({
      studentId, recipientPhone: phone, recipientName, recipientRole,
      messageBody: message, notificationType, status: 'FAILED',
      providerResponse: { error: err.message }, sentBy,
    });
    return { logged: true, status: 'FAILED', providerResponse: { error: err.message }, logId: log.id };
  }
}

/**
 * Bulk dispatch helper: sends the same message to many recipients.
 * Failures for individual recipients never abort the batch.
 * @returns {{ sent: number, failed: number, logged_only: number, logs: object[] }}
 */
async function sendBulkSMS({ recipients = [], message, type = 'ANNOUNCEMENT', sentBy = 'system' }) {
  const summary = { sent: 0, failed: 0, logged_only: 0, logs: [] };
  for (const recipient of recipients) {
    const result = await sendSMS({
      to: recipient.phone,
      message,
      studentId: recipient.studentId ?? null,
      type,
      recipientName: recipient.name || '',
      recipientRole: recipient.role || 'parent',
      sentBy,
    });
    if (result.status === 'SENT') summary.sent += 1;
    else if (result.status === 'FAILED') summary.failed += 1;
    else summary.logged_only += 1;
    summary.logs.push(result);
  }
  return summary;
}

/**
 * Fetch guardian contact rows for a set of students (used for parent broadcasts).
 */
async function fetchParentRecipients(studentIds = null) {
  const query = studentIds
    ? 'SELECT id, name, guardian_name, guardian_phone FROM students WHERE id = ANY($1::int[]);'
    : 'SELECT id, name, guardian_name, guardian_phone FROM students;';
  const result = await pool.query(query, studentIds ? [studentIds] : []);
  return result.rows
    .filter((s) => s.guardian_phone)
    .map((s) => ({
      studentId: s.id,
      name: s.guardian_name || `Parent of ${s.name}`,
      phone: s.guardian_phone,
      role: 'parent',
    }));
}

module.exports = {
  sendSMS,
  sendBulkSMS,
  formatRwandanPhone,
  logAttempt,
  fetchParentRecipients,
  isLiveConfig,
  isSandboxMode,
  VALID_TYPES,
};
