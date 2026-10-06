import mongoose from "mongoose";

const GroupSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
    },
    tasks: [{
        title: {
            type: String,
            required: true,
        },
        status: {
            type: Boolean,
            required: true,
        },
        priority: {
            type: Boolean,
            required: true,
        },
        dependencies: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Group.tasks',
        }],
        duration: {
            type: Number,
            required: true,
            default: 1,
        },
        pert: {
            optimistic: { type: Number, default: 1 },
            mostLikely: { type: Number, default: 1 },
            pessimistic: { type: Number, default: 1 },
            expected: { type: Number, default: 1 },
            standardDeviation: { type: Number, default: 0 },
            variance: { type: Number, default: 0 },
        },
        deadline: {
            type: Date,
            required: false,
        },
        createdAt: {
            type: Date,
            default: Date.now,
        },
        assignedTo: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
        },
    }],
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    members: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    }],
    invitedUsers: [{
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
    }],
    permissions: [{
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        canAddTasks: {
            type: Boolean,
            default: false,
        },
        canEditTasks: {
            type: Boolean,
            default: false,
        },
        canDeleteTasks: {
            type: Boolean,
            default: false,
        },
    }],
}, {
    timestamps: true,
});

export default mongoose.model('Group', GroupSchema);