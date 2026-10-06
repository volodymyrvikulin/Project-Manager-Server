import express from 'express';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import cors from 'cors';
import multer from 'multer';
import checkAuth from './utils/chekAuth/checkAuth.js';
import handleValidationErrors from './utils/handleValidationErrors.js';
import { loginValidation, registerValidation } from './validations/auth.js';
import { groupCreateValidation } from './validations/group.js';
import { taskValidation } from './validations/task.js';
import * as UserController from './controllers/UserController/UserController.js';
import * as GroupController from './controllers/GroupController/GroupController.js';
import * as TaskController from './controllers/TaskController/TaskController.js';
import * as AiController from './controllers/AiController/AiController.js';

dotenv.config();
const app = express();
const port = process.env.PORT;

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    },
});
const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
            return cb(new Error('Only images are allowed!'));
        }
        cb(null, true);
    },
    limits: {
        fileSize: 5 * 1024 * 1024,
    },
});

app.use('/uploads', express.static('uploads'));

app.use(express.json());
app.use(cors());
mongoose.set('strictQuery', false);
mongoose
    .connect(process.env.DB_TOKEN)
    .then(() => console.log('DB OK'))
    .catch((err) => console.log('DB ERROR', err));

app.post('/auth/register', registerValidation, handleValidationErrors, UserController.register);
app.post('/auth/login', loginValidation, handleValidationErrors, UserController.login);
app.get('/auth/me', checkAuth, UserController.getMe);
app.patch('/auth/profile', checkAuth, upload.single('avatar'), UserController.updateProfile);
app.post('/auth/invitations', checkAuth, UserController.manageInvitation);
app.get('/users/:id', checkAuth, UserController.getUserById);

app.get('/groups', checkAuth, GroupController.getAll);
app.get('/groups/:id', checkAuth, GroupController.getOne);
app.post('/groups', checkAuth, groupCreateValidation, handleValidationErrors, GroupController.create);
app.delete('/groups/:id', checkAuth, GroupController.remove);
app.patch('/groups/:id', checkAuth, groupCreateValidation, handleValidationErrors, GroupController.update);
app.post('/groups/:id/invite', checkAuth, GroupController.inviteUser);
app.post('/groups/:id/remove-user', checkAuth, GroupController.removeUser);
app.patch('/groups/:id/permissions', checkAuth, GroupController.updatePermissions);

app.get('/tasks/:groupId', checkAuth, TaskController.getAll);
app.post('/tasks/:groupId', checkAuth, taskValidation, handleValidationErrors, TaskController.create);
app.delete('/tasks/:groupId/:taskId', checkAuth, TaskController.remove);
app.patch('/tasks/:groupId/:taskId', checkAuth, taskValidation, handleValidationErrors, TaskController.update);
app.post('/ai/groups/:groupId/tasks', checkAuth, AiController.generateGroupTasks);

app.listen(port, (err) => {
    if (err) {
        return console.log(err);
    }
    console.log('Server OK');
});