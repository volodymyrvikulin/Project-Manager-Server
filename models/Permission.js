import mongoose from "mongoose";

export const ROLE_PERMISSIONS = {
    admin: {
        canAddTasks: true,
        canEditTasks: true,
        canDeleteTasks: true,
        canChangeStatus: true,
        canInviteUsers: true,
    },
    member: {
        canAddTasks: true,
        canEditTasks: false,
        canDeleteTasks: false,
        canChangeStatus: true,
        canInviteUsers: false,
    },
    viewer: {
        canAddTasks: false,
        canEditTasks: false,
        canDeleteTasks: false,
        canChangeStatus: false,
        canInviteUsers: false,
    },
};

export const PermissionSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    role: {
        type: String,
        enum: ['admin', 'member', 'viewer'],
        default: 'member',
        required: true,
    },
});

export const getMemberRoleAndPermissions = (group, userId) => {
    if (!userId || !group) {
        return { role: 'viewer', permissions: ROLE_PERMISSIONS.viewer, isOwner: false };
    }
    const userIdStr = userId.toString();
    const ownerIdStr = group.user?._id ? group.user._id.toString() : group.user?.toString();
    if (ownerIdStr === userIdStr) {
        return {
            role: 'owner',
            isOwner: true,
            permissions: {
                canAddTasks: true,
                canEditTasks: true,
                canDeleteTasks: true,
                canChangeStatus: true,
                canInviteUsers: true,
                canManageRoles: true,
                canDeleteGroup: true,
                canEditGroup: true,
            },
        };
    }

    const perm = group.permissions?.find(p => {
        const pUserId = p.userId?._id ? p.userId._id.toString() : p.userId?.toString();
        return pUserId === userIdStr;
    });

    let role = perm?.role;
    if (!role) {
        // Fallback for any legacy records in existing database
        if (perm) {
            if (perm.canDeleteTasks && perm.canEditTasks) role = 'admin';
            else if (perm.canAddTasks) role = 'member';
            else role = 'viewer';
        } else {
            role = 'member';
        }
    }

    return {
        role,
        isOwner: false,
        permissions: ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.member,
    };
};

export default PermissionSchema;
