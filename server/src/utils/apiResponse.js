const sendError = (
  res,
  {
    status = 500,
    code = "INTERNAL_ERROR",
    message = "Something went wrong",
    requestId = res.req?.requestId,
    legacy = {},
  } = {},
) =>
  res.status(status).json({
    success: false,
    error: {
      code,
      message,
    },
    message,
    requestId,
    ...legacy,
  });

module.exports = {
  sendError,
};
