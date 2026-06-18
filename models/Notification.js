const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
    userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title:       { type: String, default: '' },
    message:     { type: String, default: '' },
    type:        { type: String, enum: ['connection','message','bill','meeting','case','general'], default: 'general' },
    actionRoute: { type: String, default: '' },
    actionId:    { type: String, default: '' },
    isRead:      { type: Boolean, default: false },
    createdAt:   { type: Date, default: Date.now }
});

module.exports = mongoose.model('Notification', NotificationSchema);
