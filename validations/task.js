import { body } from 'express-validator';

export const taskValidation = [
    body('title', 'Enter the task title').isLength({ min: 2 }).isString(),
    body('description', 'Description must be a string').optional().isString(),
    body('status', 'Invalid status format').isBoolean(),
    body('priority', 'Invalid priority format').isBoolean(),
    body('dependencies', 'Dependencies must be an array of IDs').optional().isArray(),
    body('dependencies.*', 'Each dependency must be a valid ObjectId').optional().isMongoId(),
    body('duration', 'Duration must be a number greater than 0').isInt({ min: 1 }),
    body('deadline', 'Deadline must be a valid date').optional().isISO8601(),
];