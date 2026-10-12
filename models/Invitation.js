import mongoose from "mongoose";

export const GroupInvitationSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    status: {
        type: String,
        enum: ['pending', 'accepted', 'declined'],
        default: 'pending',
    },
    invitedAt: {
        type: Date,
        default: Date.now,
    },
});

export const UserInvitationSchema = new mongoose.Schema({
    groupId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Group',
        required: true,
    },
    status: {
        type: String,
        enum: ['pending', 'accepted', 'declined'],
        default: 'pending',
    },
    invitedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    invitedAt: {
        type: Date,
        default: Date.now,
    },
});

export default {
    GroupInvitationSchema,
    UserInvitationSchema,
};

