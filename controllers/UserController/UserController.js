import UserModel from '../../models/User.js';
import GroupModel from '../../models/Group.js';
import bcrypt from 'bcrypt';
import { generateToken } from '../../utils/generateToken/generateToken.js';
import fs from 'fs/promises';
import path from 'path';
import { emitToUser } from '../../socket.js';

export const register = async (req, res) => {
    try {
        const { fullName, email, password } = req.body;

        const existingUser = await UserModel.findOne({ email });
        if (existingUser) {
            return res.status(400).json({
                message: 'A user with this email already exists',
            });
        }

        const saltRounds = 10;
        const salt = await bcrypt.genSalt(saltRounds);
        const hash = await bcrypt.hash(password, salt);
        const doc = new UserModel({
            fullName,
            email,
            passwordHash: hash,
            pendingInvitations: [],
        });

        const user = await doc.save();
        const token = generateToken(user);

        const { passwordHash, ...userData } = user._doc;
        res.json({
            ...userData,
            token
        });
    } catch (error) {
        console.log(error);
        res.status(500).json({
            message: 'Failed to register. Please try again.',
        });
    }
};

export const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await UserModel.findOne({ email });
        if (!user) {
            return res.status(400).json({
                message: 'User with this email not found'
            });
        }
        const isValidPass = await bcrypt.compare(password, user._doc.passwordHash);

        if (!isValidPass) {
            return res.status(400).json({
                message: 'Invalid email or password'
            });
        }
        const token = generateToken(user);

        const { passwordHash, ...userData } = user._doc;
        res.json({
            ...userData,
            token
        });
    } catch (error) {
        console.log(error);
        res.status(500).json({
            message: 'Failed to login. Please try again.',
        });
    }
};

export const getMe = async (req, res) => {
    try {
        const user = await UserModel.findById(req.userId)
            .populate('pendingInvitations.groupId', 'title')
            .populate('pendingInvitations.invitedBy', 'fullName email');
        if (!user) {
            return res.status(404).json({
                message: 'User not found',
            });
        }
        const { passwordHash, ...userData } = user._doc;
        res.json(userData);
    } catch (error) {
        console.log(error);
        res.status(500).json({
            message: 'Access denied',
        });
    }
};

export const getUserById = async (req, res) => {
    try {
        const userId = req.params.id;
        const requesterId = req.userId;

        const user = await UserModel.findById(userId).select('-passwordHash');
        if (!user) {
            return res.status(404).json({
                message: 'User not found',
            });
        }

        const requesterGroups = await GroupModel.find({ members: requesterId });
        const isInSameGroup = requesterGroups.some(group => group.members.includes(userId));
        if (!isInSameGroup) {
            return res.status(403).json({
                message: 'You can only view profiles of users in your groups',
            });
        }

        res.json(user);
    } catch (error) {
        console.log(error);
        res.status(500).json({
            message: 'Failed to fetch user data',
        });
    }
};

export const updateProfile = async (req, res) => {
    try {
        const userId = req.userId;
        const { fullName, phone, bio } = req.body;

        const user = await UserModel.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (fullName) user.fullName = fullName;
        if (phone !== undefined) user.phone = phone;
        if (bio !== undefined) user.bio = bio;

        if (req.file) {
            if (user.avatarUrl) {
                const uploadsDir = path.join(process.cwd(), 'uploads');
                const oldFilePath = path.join(process.cwd(), user.avatarUrl);

                if (oldFilePath.startsWith(uploadsDir)) {
                    try {
                        await fs.access(oldFilePath);
                        await fs.unlink(oldFilePath);
                    } catch (err) {
                        console.log('Failed to delete old avatar:', err.message);
                    }
                } else {
                    console.log('Invalid avatar path, skipping deletion:', user.avatarUrl);
                }
            }
            user.avatarUrl = `/uploads/${req.file.filename}`;
        }

        await user.save();

        const { passwordHash, ...userData } = user._doc;
        res.json(userData);
    } catch (error) {
        console.log(error);
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                message: 'File size exceeds 5 MB',
            });
        }
        res.status(500).json({ message: 'Failed to update profile' });
    }
};

export const manageInvitation = async (req, res) => {
    try {
        const { groupId, action } = req.body;
        const userId = req.userId;

        if (!['accept', 'decline'].includes(action)) {
            return res.status(400).json({
                message: "Invalid action. Use 'accept' or 'decline'",
            });
        }

        const user = await UserModel.findById(userId);
        const invitationIndex = user.pendingInvitations.findIndex(
            (invite) => invite.groupId.toString() === groupId && invite.status === 'pending'
        );

        if (invitationIndex === -1) {
            return res.status(404).json({
                message: "Invitation not found or already processed",
            });
        }

        const group = await GroupModel.findById(groupId);
        const groupInvitationIndex = group.invitedUsers.findIndex(
            (invite) => invite.userId.toString() === userId.toString() && invite.status === 'pending'
        );

        if (groupInvitationIndex === -1) {
            return res.status(404).json({
                message: "Invitation not found in the group",
            });
        }

        if (action === 'accept') {
            user.pendingInvitations[invitationIndex].status = 'accepted';
            group.invitedUsers[groupInvitationIndex].status = 'accepted';
            if (!group.members.includes(userId)) {
                group.members.push(userId);
            }
        } else {
            user.pendingInvitations.splice(invitationIndex, 1);
            group.invitedUsers.splice(groupInvitationIndex, 1); 
        }

        await user.save();
        await group.save();

        const updatedGroup = await GroupModel.findById(groupId)
            .populate('members', 'fullName email')
            .populate('user', 'fullName email');

        try {
            if (action === 'accept' && group.user) {
                emitToUser(group.user.toString(), 'invitation_accepted', {
                    groupId: group._id,
                    groupTitle: group.title,
                    user: {
                        _id: user._id,
                        fullName: user.fullName,
                        email: user.email,
                    },
                    message: `Користувач ${user.fullName} прийняв(ла) запрошення до проєкту "${group.title}"`,
                });
            }
        } catch (socketErr) {
            console.error('Socket notification error:', socketErr);
        }

        res.json({
            message: `Invitation ${action === 'accept' ? 'accepted' : 'declined'}`,
            group: updatedGroup,
        });
    } catch (error) {
        console.log(error);
        res.status(500).json({
            message: 'Failed to process the invitation',
        });
    }
};