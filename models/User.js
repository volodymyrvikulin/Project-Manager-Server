import mongoose from "mongoose";
import { UserInvitationSchema } from "./Invitation.js";

const UserSchema = new mongoose.Schema({
    fullName: {
        type: String,  
        required: true,
        maxlength: 50,
    },
    email: {
        type: String,  
        required: true,
        unique: true,
        maxlength: 50,
    },
    passwordHash: {
        type: String,
        required: true,
    },
    avatarUrl: {
        type: String,
        default: '',
        maxlength: 200,
    },
    phone: {
        type: String,
        default: '',
        maxlength: 20,
    },
    bio: {
        type: String,
        default: '',
        maxlength: 500,
    },
    pendingInvitations: [UserInvitationSchema],
}, {
    timestamps: true,
});

export default mongoose.model('User', UserSchema);