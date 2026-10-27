const nodemailer = require('nodemailer');
const pool = require('../config/database');

function configuredRecipients(...values) {
  return [...new Set(values.flatMap((value) => (value || '')
    .split(',')
    .map((recipient) => recipient.trim())
    .filter(Boolean)))];
}

function notificationContent(eventType, permission) {
  const eventLabel = eventType === 'overdue' ? 'overdue for return' : 'leave permission approved';
  const expectedReturn = permission.expected_return_time
    ? new Date(permission.expected_return_time).toLocaleString()
    : 'not specified';
  const message = `${permission.student_name} (${permission.class_name}) is ${eventLabel}. Expected return: ${expectedReturn}. Reason: ${permission.reason}`;
  return {
    subject: `Smart School: ${eventLabel}`,
    text: message,
  };
}

async function deliverEmail(recipient, content) {
  const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASSWORD, SMTP_FROM } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD || !SMTP_FROM) {
    throw new Error('SMTP_HOST, SMTP_USER, SMTP_PASSWORD, and SMTP_FROM must be configured.');
  }
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT || 587),
    secure: SMTP_SECURE === 'true',
    auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
  });
  await transporter.sendMail({ from: SMTP_FROM, to: recipient, ...content });
}

async function deliverSms(recipient, content) {
  const { AFRICASTALKING_USERNAME, AFRICASTALKING_API_KEY, AFRICASTALKING_SENDER_ID } = process.env;
  if (!AFRICASTALKING_USERNAME || !AFRICASTALKING_API_KEY) {
    throw new Error('AFRICASTALKING_USERNAME and AFRICASTALKING_API_KEY must be configured.');
  }

  const body = new URLSearchParams({
    username: AFRICASTALKING_USERNAME,
    to: recipient,
    message: content.text,
  });
  if (AFRICASTALKING_SENDER_ID) body.set('from', AFRICASTALKING_SENDER_ID);

  const response = await fetch('https://api.africastalking.com/version1/messaging', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      apiKey: AFRICASTALKING_API_KEY,
    },
    body,
  });
  if (!response.ok) {
    throw new Error(`Africa's Talking returned HTTP ${response.status}.`);
  }
  const result = await response.json();
  const recipients = result.SMSMessageData?.Recipients;
  if (!Array.isArray(recipients) || recipients.length === 0 ||
      recipients.some((entry) => ![100, 101, 102].includes(Number(entry.statusCode)))) {
    throw new Error("Africa's Talking did not accept the SMS recipient.");
  }
}

async function dispatchDelivery(delivery, content) {
  if (delivery.channel === 'email') {
    await deliverEmail(delivery.recipient, content);
    return;
  }
  await deliverSms(delivery.recipient, content);
}

async function dispatchPendingNotifications(filter = {}) {
  const conditions = ["nd.status IN ('pending', 'failed')", 'nd.attempts < 3'];
  const values = [];
  if (filter.permissionId) {
    values.push(filter.permissionId);
    conditions.push(`nd.permission_id = $${values.length}`);
  }
  if (filter.eventType) {
    values.push(filter.eventType);
    conditions.push(`nd.event_type = $${values.length}`);
  }

  const deliveries = await pool.query(
    `SELECT nd.id, nd.permission_id, nd.event_type, nd.channel, nd.recipient,
            p.reason, TO_CHAR(COALESCE(p.expected_return_time, p.return_timestamp), 'YYYY-MM-DD"T"HH24:MI:SS') AS expected_return_time,
            s.name AS student_name, s.class AS class_name
     FROM notification_deliveries nd
     JOIN permissions p ON p.id = nd.permission_id
     JOIN students s ON s.id = p.student_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY nd.created_at ASC
     LIMIT 50;`,
    values
  );

  for (const delivery of deliveries.rows) {
    const content = notificationContent(delivery.event_type, delivery);
    try {
      await dispatchDelivery(delivery, content);
      await pool.query(
        `UPDATE notification_deliveries
         SET status = 'sent', attempts = attempts + 1, last_error = NULL, sent_at = CURRENT_TIMESTAMP
         WHERE id = $1;`,
        [delivery.id]
      );
    } catch (error) {
      console.error(`PERMISSION_NOTIFICATION_${delivery.channel.toUpperCase()}_ERROR:`, error.message);
      await pool.query(
        `UPDATE notification_deliveries
         SET status = 'failed', attempts = attempts + 1, last_error = $2
         WHERE id = $1;`,
        [delivery.id, error.message]
      );
    }
  }
}

async function enqueuePermissionNotification(permissionId, eventType) {
  const result = await pool.query(
    `SELECT p.id, p.reason,
            TO_CHAR(COALESCE(p.expected_return_time, p.return_timestamp), 'YYYY-MM-DD"T"HH24:MI:SS') AS expected_return_time,
            s.name AS student_name, s.class AS class_name, s.guardian_email, s.guardian_phone
     FROM permissions p
     JOIN students s ON s.id = p.student_id
     WHERE p.id = $1;`,
    [permissionId]
  );
  if (!result.rowCount) throw new Error(`Permission ${permissionId} was not found for notification.`);

  const student = result.rows[0];
  const recipients = [
    ...configuredRecipients(process.env.ADMIN_NOTIFICATION_EMAILS, student.guardian_email)
      .map((recipient) => ({ channel: 'email', recipient })),
    ...configuredRecipients(process.env.ADMIN_NOTIFICATION_PHONES, student.guardian_phone)
      .map((recipient) => ({ channel: 'sms', recipient })),
  ];

  for (const destination of recipients) {
    await pool.query(
      `INSERT INTO notification_deliveries (permission_id, event_type, channel, recipient)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (permission_id, event_type, channel, recipient) DO NOTHING;`,
      [permissionId, eventType, destination.channel, destination.recipient]
    );
  }

  if (!recipients.length) {
    console.warn(`PERMISSION_NOTIFICATION_NO_RECIPIENTS: permission ${permissionId}, event ${eventType}`);
    return;
  }

  dispatchPendingNotifications({ permissionId, eventType }).catch((error) => {
    console.error('PERMISSION_NOTIFICATION_DISPATCH_ERROR:', error);
  });
}

async function retryFailedNotifications() {
  await dispatchPendingNotifications();
}

module.exports = { enqueuePermissionNotification, retryFailedNotifications };
