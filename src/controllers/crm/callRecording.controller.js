const CRMCall = require('../../models/crm/Call');
const ApiResponse = require('../../utils/ApiResponse');
const ApiError = require('../../utils/ApiError');
const { logCRMActivity } = require('../../services/crm/activity.service');

/**
 * POST /api/crm/calls/:callId/recording
 * Save recording metadata / upload link (stores URL, not binary in MongoDB)
 */
const uploadCallRecording = async (req, res) => {
  const { callId } = req.params;
  const { url, duration, storageProvider = 'cloud', fileSize, mimeType } = req.body;

  // Check if multer file was uploaded
  const fileUrl = req.file ? `/uploads/recordings/${req.file.filename}` : url;

  if (!fileUrl) {
    throw new ApiError(400, 'Recording URL or audio file is required');
  }

  const call = await CRMCall.findOne({
    $or: [{ _id: callId.match(/^[0-9a-fA-F]{24}$/) ? callId : null }, { callId }],
  });
  if (!call) throw new ApiError(404, 'Call not found');

  call.recording = {
    url: fileUrl,
    duration: duration ? Number(duration) : call.duration,
    storageProvider,
    fileSize: fileSize || req.file?.size,
    mimeType: mimeType || req.file?.mimetype,
    uploadedAt: new Date(),
  };

  await call.save();

  await logCRMActivity({
    action: 'call_recording_uploaded',
    entityType: 'CRMCall',
    entityId: call._id,
    performedBy: req.user,
    lead: call.lead,
    metadata: { callId: call.callId, recordingUrl: fileUrl },
    req,
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      { recording: call.recording },
      'Call recording metadata saved successfully'
    )
  );
};

/**
 * GET /api/crm/calls/:callId/recording
 */
const getCallRecording = async (req, res) => {
  const { callId } = req.params;

  const call = await CRMCall.findOne({
    $or: [{ _id: callId.match(/^[0-9a-fA-F]{24}$/) ? callId : null }, { callId }],
  });
  if (!call) throw new ApiError(404, 'Call not found');

  if (!call.recording?.url) {
    throw new ApiError(404, 'No audio recording found for this call');
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        url: call.recording.url,
        duration: call.recording.duration,
        storageProvider: call.recording.storageProvider,
      },
      'Recording URL fetched successfully'
    )
  );
};

/**
 * GET /api/crm/calls/:callId/recording/details
 */
const getCallRecordingDetails = async (req, res) => {
  const { callId } = req.params;

  const call = await CRMCall.findOne({
    $or: [{ _id: callId.match(/^[0-9a-fA-F]{24}$/) ? callId : null }, { callId }],
  });
  if (!call) throw new ApiError(404, 'Call not found');

  return res.status(200).json(
    new ApiResponse(
      200,
      { recording: call.recording || null },
      'Recording details fetched successfully'
    )
  );
};

/**
 * DELETE /api/crm/calls/:callId/recording
 */
const deleteCallRecording = async (req, res) => {
  const { callId } = req.params;

  const call = await CRMCall.findOne({
    $or: [{ _id: callId.match(/^[0-9a-fA-F]{24}$/) ? callId : null }, { callId }],
  });
  if (!call) throw new ApiError(404, 'Call not found');

  call.recording = undefined;
  await call.save();

  return res
    .status(200)
    .json(new ApiResponse(200, null, 'Call recording removed successfully'));
};

module.exports = {
  uploadCallRecording,
  getCallRecording,
  getCallRecordingDetails,
  deleteCallRecording,
};
