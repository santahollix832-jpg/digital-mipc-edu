/**
 * Validation middleware for attendance endpoints
 */

const validateScanRequest = (req, res, next) => {
  const { student_id, student_identifier, check_in_method, device_id } = req.body;

  if (student_identifier !== undefined && (typeof student_identifier !== 'string' || !student_identifier.trim())) {
    return res.status(400).json({
      error: 'Validation Error',
      message: 'student_identifier must be a non-empty string',
      timestamp: new Date().toISOString()
    });
  }

  if (!student_id && !student_identifier) {
    return res.status(400).json({
      error: 'Validation Error',
      message: 'student_id or student_identifier is required',
      timestamp: new Date().toISOString()
    });
  }

  if (typeof check_in_method !== 'string' || !check_in_method.trim()) {
    return res.status(400).json({
      error: 'Validation Error',
      message: 'check_in_method is required (NFC or QR)',
      timestamp: new Date().toISOString()
    });
  }

  if (student_identifier && student_identifier.trim().length > 100) {
    return res.status(400).json({
      error: 'Validation Error',
      message: 'student_identifier must be 100 characters or fewer',
      timestamp: new Date().toISOString()
    });
  }

  if (typeof device_id !== 'string' || !device_id.trim() || device_id.trim().length > 50) {
    return res.status(400).json({
      error: 'Validation Error',
      message: 'device_id must contain 1 to 50 characters',
      timestamp: new Date().toISOString()
    });
  }

  const validMethods = ['NFC', 'QR'];
  if (!validMethods.includes(check_in_method.toUpperCase())) {
    return res.status(400).json({
      error: 'Validation Error',
      message: `check_in_method must be one of: ${validMethods.join(', ')}`,
      timestamp: new Date().toISOString()
    });
  }

  if (student_id && (!Number.isSafeInteger(Number(student_id)) || Number(student_id) <= 0)) {
    return res.status(400).json({
      error: 'Validation Error',
      message: 'student_id must be a number',
      timestamp: new Date().toISOString()
    });
  }

  // Attach normalized data to request
  req.validatedData = {
    student_id: student_id ? Number(student_id) : null,
    student_identifier: typeof student_identifier === 'string' ? student_identifier.trim() : null,
    check_in_method: check_in_method.trim().toUpperCase(),
    device_id: device_id.trim()
  };

  next();
};

module.exports = {
  validateScanRequest
};
