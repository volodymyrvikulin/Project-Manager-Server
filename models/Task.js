import mongoose from "mongoose";
import { PertSchema } from "./Pert.js";

export const TaskSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
    },
    description: {
        type: String,
        default: '',
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
        type: PertSchema,
        default: () => ({
            optimistic: 1,
            mostLikely: 1,
            pessimistic: 1,
            expected: 1,
            standardDeviation: 0,
            variance: 0,
        }),
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
});

export default TaskSchema;
