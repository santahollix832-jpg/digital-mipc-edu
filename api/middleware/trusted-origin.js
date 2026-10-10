function requireTrustedOrigin(allowedOrigins) {
  return (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      return next();
    }

    const originHeader = req.get('origin');
    const refererHeader = req.get('referer');
    let requestOrigin;

    try {
      requestOrigin = originHeader
        ? new URL(originHeader).origin
        : refererHeader
          ? new URL(refererHeader).origin
          : null;
    } catch {
      requestOrigin = null;
    }

    if (!requestOrigin || !allowedOrigins.includes(requestOrigin)) {
      return res.status(403).json({ success: false, error: 'Request origin is not allowed' });
    }
    return next();
  };
}

module.exports = requireTrustedOrigin;
