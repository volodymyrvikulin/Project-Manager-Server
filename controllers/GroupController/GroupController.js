import GroupModel from '../../models/Group.js';
import UserModel from '../../models/User.js';
import { getMemberRoleAndPermissions, ROLE_PERMISSIONS } from '../../models/Permission.js';
import handleError from '../../utils/handleError.js';
import { emitToUser } from '../../socket.js';

export const getAll = async (req, res) => {
    try {
        const groups = await GroupModel.find({
            $or: [
                { user: req.userId },
                { 'members': req.userId },
            ],
        }).populate('members', 'fullName email');
        res.json(groups);
    } catch (error) {
        console.log(error);
        handleError(res, 'Failed to retrieve groups');
    }
};

export const getOne = async (req, res) => {
    try {
        const groupId = req.params.id;
        const group = await GroupModel.findOne({
            _id: groupId,
            $or: [
                { user: req.userId },
                { 'members': req.userId },
            ],
        }).populate('members', 'fullName email');

        if (!group) {
            return res.status(404).json({
                message: "Group not found or you do not have access",
            });
        }

        res.json(group);
    } catch (error) {
        console.log(error);
        handleError(res, 'Failed to retrieve the group');
    }
};

export const create = async (req, res) => {
    try {
        const { title, tasks } = req.body;
        const doc = new GroupModel({
            title,
            tasks,
            user: req.userId,
            members: [req.userId], 
            invitedUsers: [],
        });
        const group = await doc.save();
        
        const populatedGroup = await GroupModel.findById(group._id)
            .populate('members', 'fullName email')
            .populate('user', 'fullName email');
        
        res.json(populatedGroup);
    } catch (error) {
        console.log(error);
        handleError(res, 'Failed to create the group');
    }
};

export const remove = async (req, res) => {
    try {
        const groupId = req.params.id;
        const group = await GroupModel.findOne({
            _id: groupId,
            user: req.userId,
        });

        if (!group) {
            return res.status(404).json({
                message: "Group not found or you are not the owner",
            });
        }

        await UserModel.updateMany(
            { 'pendingInvitations.groupId': groupId },
            { $pull: { pendingInvitations: { groupId } } }
        );

        await group.deleteOne();
        res.json({ message: 'Group successfully deleted' });
    } catch (error) {
        console.log(error);
        handleError(res, 'Failed to delete the group');
    }
};

export const update = async (req, res) => {
    try {
        const { title, tasks } = req.body;
        const groupId = req.params.id;

        const updatedGroup = await GroupModel.findOneAndUpdate(
            {
                _id: groupId,
                user: req.userId,
            },
            {
                title,
                tasks,
            },
            {
                returnDocument: 'after',
            }
        ).populate('members', 'fullName email');

        if (!updatedGroup) {
            return res.status(404).json({
                message: "Group not found or you are not the owner",
            });
        }

        res.json(updatedGroup);
    } catch (error) {
        console.log(error);
        handleError(res, 'Failed to update the group');
    }
};

export const inviteUser = async (req, res) => {
    try {
        const { email } = req.body;
        const groupId = req.params.id;

        const group = await GroupModel.findOne({
            _id: groupId,
            $or: [{ user: req.userId }, { members: req.userId }],
        });

        if (!group) {
            return res.status(404).json({
                message: "Group not found or you do not have access",
            });
        }

        const { permissions } = getMemberRoleAndPermissions(group, req.userId);
        if (!permissions.canInviteUsers) {
            return res.status(403).json({
                message: "You do not have permission to invite users to this group",
            });
        }

        const user = await UserModel.findOne({ email });
        if (!user) {
            return res.status(404).json({
                message: "User with this email not found",
            });
        }

        if (user._id.toString() === req.userId.toString()) {
            return res.status(400).json({
                message: "You cannot invite yourself",
            });
        }

        if (group.members.includes(user._id)) {
            return res.status(400).json({
                message: "User is already a member of the group",
            });
        }

        const existingPendingInvitation = group.invitedUsers.find(
            (invite) => invite.userId.toString() === user._id.toString() && invite.status === 'pending'
        );
        if (existingPendingInvitation) {
            return res.status(400).json({
                message: "An invitation has already been sent to this user",
            });
        }

        group.invitedUsers = group.invitedUsers.filter(
            (invite) => invite.userId.toString() !== user._id.toString() || invite.status !== 'declined'
        );

        group.invitedUsers.push({
            userId: user._id,
            status: 'pending',
            invitedAt: new Date(),
        });
        await group.save();

        await UserModel.updateOne(
            { _id: user._id },
            { $pull: { pendingInvitations: { groupId, status: 'declined' } } }
        );

        await UserModel.updateOne(
            { _id: user._id },
            {
                $push: {
                    pendingInvitations: {
                        groupId,
                        status: 'pending',
                        invitedBy: req.userId,
                        invitedAt: new Date(),
                    },
                },
            }
        );

        const updatedGroup = await GroupModel.findById(groupId)
            .populate('members', 'fullName email')
            .populate('user', 'fullName email');

        try {
            const sender = await UserModel.findById(req.userId).select('fullName email');
            emitToUser(user._id.toString(), 'invitation_received', {
                groupId: {
                    _id: group._id,
                    title: group.title,
                },
                invitedBy: {
                    _id: req.userId,
                    fullName: sender?.fullName || 'Користувач',
                    email: sender?.email || '',
                },
                invitedAt: new Date(),
                status: 'pending',
                message: `Вас запрошено до проєкту "${group.title}"`,
            });
        } catch (socketErr) {
            console.error('Socket notification error:', socketErr);
        }

        res.json({
            message: `Invitation sent to user ${user.fullName}`,
            group: updatedGroup,
        });
    } catch (error) {
        console.log(error);
        handleError(res, 'Failed to send the invitation');
    }
};

export const removeUser = async (req, res) => {
    try {
        const { userId } = req.body;
        const groupId = req.params.id;

        const group = await GroupModel.findOne({
            _id: groupId,
            $or: [
                { user: req.userId },
                { members: req.userId },
            ],
        });

        if (!group) {
            return res.status(404).json({
                message: "Group not found or you do not have access",
            });
        }

        if (!group.members.includes(userId)) {
            return res.status(400).json({
                message: "This user is not a member of the group",
            });
        }

        const isOwner = group.user.toString() === req.userId.toString();

        const isRemovingSelf = userId.toString() === req.userId.toString();

        if (!isRemovingSelf && !isOwner) {
            return res.status(403).json({
                message: "You can only remove yourself from the group if you are not the owner",
            });
        }

        if (isRemovingSelf && isOwner) {
            return res.status(400).json({
                message: "The owner cannot leave the group through this action. Delete the group if you want to leave",
            });
        }

        group.members = group.members.filter(memberId => memberId.toString() !== userId.toString());
        group.invitedUsers = group.invitedUsers.filter(
            invite => invite.userId.toString() !== userId.toString()
        );
        group.permissions = group.permissions.filter(
            perm => perm.userId.toString() !== userId.toString()
        );

        group.tasks = group.tasks.map(task => {
            if (task.assignedTo && task.assignedTo.toString() === userId.toString()) {
                return { ...task, assignedTo: null };
            }
            return task;
        });

        await group.save();

        await UserModel.updateOne(
            { _id: userId },
            { $pull: { pendingInvitations: { groupId } } }
        );

        const updatedGroup = await GroupModel.findById(groupId)
            .populate('members', 'fullName email')
            .populate('user', 'fullName email');

        res.json({
            message: isRemovingSelf ? 'You have successfully left the group' : 'User removed from the group',
            group: updatedGroup,
        });
    } catch (error) {
        console.log(error);
        handleError(res, 'Failed to remove the user');
    }
};

export const updatePermissions = async (req, res) => {
    try {
        const groupId = req.params.id;
        const { userId, role = 'member' } = req.body;

        const group = await GroupModel.findOne({
            _id: groupId,
            user: req.userId,
        });

        if (!group) {
            return res.status(404).json({
                message: "Group not found or you are not the owner",
            });
        }

        if (!group.members.some(m => m.toString() === userId.toString())) {
            return res.status(400).json({
                message: "This user is not a member of the group",
            });
        }

        if (userId.toString() === req.userId.toString()) {
            return res.status(400).json({
                message: "You cannot modify permissions for yourself",
            });
        }

        const validRoles = ['admin', 'member', 'viewer'];
        const targetRole = validRoles.includes(role) ? role : 'member';

        const permissionIndex = group.permissions.findIndex(
            (perm) => perm.userId.toString() === userId.toString()
        );

        if (permissionIndex !== -1) {
            group.permissions[permissionIndex].role = targetRole;
        } else {
            group.permissions.push({
                userId,
                role: targetRole,
            });
        }

        await group.save();

        const updatedGroup = await GroupModel.findById(groupId)
            .populate('members', 'fullName email')
            .populate('user', 'fullName email');

        res.json(updatedGroup);
    } catch (error) {
        console.log(error);
        handleError(res, 'Failed to update permissions');
    }
};