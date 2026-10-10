/**
 * Validation middleware for attendance endpoints
 */

const validateScanRequest = (req, res, next) => {
  const { student_id, check_in_method, device_id } = req.body;

  // Check required fields
  if (!student_id) {
    return res.status(400).json({
      error: 'Validation Error',
      message: 'student_id is required',
      timestamp: new Date().toISOString()
    });
  }

  if (!check_in_method) {
    return res.status(400).json({
      error: 'Validation Error',
      message: 'check_in_method is required (NFC or QR)',
      timestamp: new Date().toISOString()
    });
  }

  if (!device_id) {
    return res.status(400).json({
      error: 'Validation Error',
      message: 'device_id is required',
      timestamp: new Date().toISOString()
    });
  }

  // Validate check_in_method
  const validMethods = ['NFC', 'QR'];
  if (!validMethods.includes(check_in_method.toUpperCase())) {
    return res.status(400).json({
      error: 'Validation Error',
      message: `check_in_method must be one of: ${validMethods.join(', ')}`,
      timestamp: new Date().toISOString()
    });
  }

  // Validate student_id is numeric
  if (isNaN(student_id)) {
    return res.status(400).json({
      error: 'Validation Error',
      message: 'student_id must be a number',
      timestamp: new Date().toISOString()
    });
  }

  // Validate device_id is not empty
  if (typeof device_id !== 'string' || device_id.trim().length === 0) {
    return res.status(400).json({
      error: 'Validation Error',
      message: 'device_id must be a non-empty string',
      timestamp: new Date().toISOString()
    });
  }

  // Attach normalized data to request
  req.validatedData = {
    student_id: parseInt(student_id),
    check_in_method: check_in_method.toUpperCase(),
    device_id: device_id.trim()
  };

  next();
};

module.exports = {
  validateScanRequest
};
