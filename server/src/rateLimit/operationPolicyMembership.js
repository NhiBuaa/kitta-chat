const freezeIds = (ids) => Object.freeze([...ids]);

const OPERATION_POLICY_MEMBERSHIP = Object.freeze({
  "POST /api/auth/login": freezeIds(["auth_entry.aggregate", "auth_entry.login"]),
  "POST /api/auth/register": freezeIds(["auth_entry.aggregate", "auth_entry.register"]),
  "POST /api/auth/google": freezeIds(["auth_entry.aggregate", "auth_entry.google"]),
  "POST /api/auth/forgot-password": freezeIds(["auth_recovery_request"]),
  "POST /api/auth/reset-password/:id": freezeIds(["auth_recovery_complete"]),
  "POST /api/auth/refresh stage A": freezeIds(["auth_refresh.stage_a"]),
  "refresh subject admission stage B": freezeIds(["auth_refresh.stage_b"]),
  "POST /api/files/init": freezeIds(["file_resource.aggregate", "file_resource.upload_control"]),
  "POST /api/files/get-presigned-url": freezeIds(["file_resource.aggregate", "file_resource.part_presign"]),
  "POST /api/files/complete": freezeIds(["file_resource.aggregate", "file_resource.upload_control"]),
  "POST /api/files/upload-single": freezeIds(["file_resource.aggregate", "file_resource.upload_control"]),
  "POST /api/files/:fileId/download-url": freezeIds(["file_resource.aggregate", "file_resource.download_signing"]),
  "GET /api/calls/history": freezeIds(["read_expensive.aggregate", "read_expensive.call_history"]),
  "GET /api/calls/missed": freezeIds(["read_expensive.aggregate", "read_expensive.call_history"]),
  "POST /api/calls/:id/read": freezeIds(["state_mutation.aggregate", "state_mutation.call_history"]),
  "POST /api/calls/read-all": freezeIds(["state_mutation.aggregate", "state_mutation.call_history"]),
  "Socket.IO initCall": freezeIds(["call_initiation"]),
  "Socket.IO callUser": freezeIds(["call_initiation"]),
  "Socket.IO answerCall": freezeIds([]),
  "Socket.IO endCall": freezeIds([]),
  "Socket.IO rejectCall": freezeIds([]),
  "Socket.IO toggleMedia": freezeIds([]),
});

module.exports = { OPERATION_POLICY_MEMBERSHIP };
