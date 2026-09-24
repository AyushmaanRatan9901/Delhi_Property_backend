const CRMLead = require('../../models/crm/Lead');
const CRMLeadNote = require('../../models/crm/LeadNote');
const ApiResponse = require('../../utils/ApiResponse');
const ApiError = require('../../utils/ApiError');
const { logCRMActivity } = require('../../services/crm/activity.service');

/**
 * POST /api/crm/leads/:leadId/notes
 */
const createNote = async (req, res) => {
  const { leadId } = req.params;
  const { content, category = 'general' } = req.body;

  if (!content || !content.trim()) {
    throw new ApiError(400, 'Note content cannot be empty');
  }

  const lead = await CRMLead.findOne({
    $or: [{ _id: leadId.match(/^[0-9a-fA-F]{24}$/) ? leadId : null }, { leadId }],
  });
  if (!lead) throw new ApiError(404, 'Lead not found');

  const note = await CRMLeadNote.create({
    lead: lead._id,
    content: content.trim(),
    category,
    createdBy: req.user._id,
  });

  await logCRMActivity({
    action: 'note_added',
    entityType: 'CRMLeadNote',
    entityId: note._id,
    performedBy: req.user,
    lead: lead._id,
    req,
  });

  return res.status(201).json(new ApiResponse(201, { note }, 'Note added successfully'));
};

/**
 * GET /api/crm/leads/:leadId/notes
 */
const getNotes = async (req, res) => {
  const { leadId } = req.params;

  const lead = await CRMLead.findOne({
    $or: [{ _id: leadId.match(/^[0-9a-fA-F]{24}$/) ? leadId : null }, { leadId }],
  });
  if (!lead) throw new ApiError(404, 'Lead not found');

  const notes = await CRMLeadNote.find({ lead: lead._id })
    .populate('createdBy', 'name staffId role profilePhoto')
    .sort({ createdAt: -1 })
    .lean();

  return res
    .status(200)
    .json(new ApiResponse(200, { notes }, 'Notes fetched successfully'));
};

/**
 * PATCH /api/crm/leads/:leadId/notes/:noteId
 */
const updateNote = async (req, res) => {
  const { noteId } = req.params;
  const { content, category } = req.body;

  const note = await CRMLeadNote.findById(noteId);
  if (!note) throw new ApiError(404, 'Note not found');

  // Check ownership
  if (
    note.createdBy.toString() !== req.user._id.toString() &&
    !['super_admin', 'admin'].includes(req.user.role)
  ) {
    throw new ApiError(403, 'You can only edit your own notes');
  }

  if (content) note.content = content.trim();
  if (category) note.category = category;
  await note.save();

  return res.status(200).json(new ApiResponse(200, { note }, 'Note updated successfully'));
};

/**
 * DELETE /api/crm/leads/:leadId/notes/:noteId
 */
const deleteNote = async (req, res) => {
  const { noteId } = req.params;

  const note = await CRMLeadNote.findById(noteId);
  if (!note) throw new ApiError(404, 'Note not found');

  if (
    note.createdBy.toString() !== req.user._id.toString() &&
    !['super_admin', 'admin'].includes(req.user.role)
  ) {
    throw new ApiError(403, 'You can only delete your own notes');
  }

  await CRMLeadNote.findByIdAndDelete(noteId);

  return res.status(200).json(new ApiResponse(200, null, 'Note deleted successfully'));
};

module.exports = {
  createNote,
  getNotes,
  updateNote,
  deleteNote,
};
