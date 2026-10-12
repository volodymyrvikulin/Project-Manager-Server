import mongoose from "mongoose";
import { TaskSchema } from "./Task.js";
import { PermissionSchema } from "./Permission.js";
import { GroupInvitationSchema } from "./Invitation.js";

const GroupSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
    },
    tasks: [TaskSchema],
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    members: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    }],
    invitedUsers: [GroupInvitationSchema],
    permissions: [PermissionSchema],
}, {
    timestamps: true,
});

export default mongoose.model('Group', GroupSchema);