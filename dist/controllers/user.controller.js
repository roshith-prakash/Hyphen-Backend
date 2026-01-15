import cloudinary from "../utils/cloudinary.js";
import { prisma } from "../utils/prismaClient.js";
export const createUser = async (req, res) => {
    var _a;
    try {
        if (req === null || req === void 0 ? void 0 : req.file) {
            cloudinary.uploader.upload(req.file.path, async function (err, result) {
                var _a;
                if (err) {
                    console.log(err);
                    return res.status(500).json({
                        message: "Something went wrong! Please try again.",
                    });
                }
                else {
                    const user = JSON.parse((_a = req.body) === null || _a === void 0 ? void 0 : _a.user);
                    const checkUser = await prisma.user.findUnique({
                        where: {
                            email: user === null || user === void 0 ? void 0 : user.email,
                        },
                    });
                    if (!checkUser) {
                        const createdUser = await prisma.user.create({
                            data: {
                                firebaseUID: user === null || user === void 0 ? void 0 : user.uid,
                                email: user === null || user === void 0 ? void 0 : user.email,
                                name: user === null || user === void 0 ? void 0 : user.name,
                                photoURL: result === null || result === void 0 ? void 0 : result.secure_url,
                            },
                        });
                        res.status(200).send({ user: createdUser });
                        return;
                    }
                    else {
                        res.status(200).send({ user: checkUser });
                        return;
                    }
                }
            });
        }
        else {
            const user = JSON.parse((_a = req.body) === null || _a === void 0 ? void 0 : _a.user);
            const checkUser = await prisma.user.findUnique({
                where: {
                    email: user === null || user === void 0 ? void 0 : user.email,
                },
            });
            if (!checkUser) {
                const createdUser = await prisma.user.create({
                    data: {
                        firebaseUID: user === null || user === void 0 ? void 0 : user.uid,
                        email: user === null || user === void 0 ? void 0 : user.email,
                        name: user === null || user === void 0 ? void 0 : user.name,
                        photoURL: user === null || user === void 0 ? void 0 : user.image,
                    },
                });
                res.status(200).send({ user: createdUser });
                return;
            }
            else {
                res.status(200).send({ user: checkUser });
                return;
            }
        }
    }
    catch (err) {
        console.log(err);
        res.status(500).send({ data: "Something went wrong." });
        return;
    }
};
export const getCurrentUser = async (req, res) => {
    var _a;
    try {
        const user = (_a = req.body) === null || _a === void 0 ? void 0 : _a.user;
        const userInDB = await prisma.user.findUnique({
            where: {
                email: user === null || user === void 0 ? void 0 : user.email,
            },
        });
        if (!userInDB) {
            res.status(404).send({ data: "User does not exist." });
            return;
        }
        res.status(200).send({ user: userInDB });
        return;
    }
    catch (err) {
        console.log(err);
        res.status(500).send({ data: "Something went wrong." });
        return;
    }
};
export const getUserProfile = async (req, res) => {
    var _a;
    try {
        const email = (_a = req.body) === null || _a === void 0 ? void 0 : _a.email;
        const userInDB = await prisma.user.findUnique({
            where: {
                email: email,
            },
            select: {
                name: true,
                email: true,
                createdAt: true,
                photoURL: true,
            },
        });
        if (!userInDB) {
            res.status(404).send({ data: "User does not exist." });
            return;
        }
        res.status(200).send({ user: userInDB });
        return;
    }
    catch (err) {
        console.log(err);
        res.status(500).send({ data: "Something went wrong." });
        return;
    }
};
export const updateUser = async (req, res) => {
    var _a, _b, _c;
    try {
        if (req === null || req === void 0 ? void 0 : req.file) {
            cloudinary.uploader.upload(req.file.path, async function (err, result) {
                var _a, _b, _c;
                if (err) {
                    console.log(err);
                    return res.status(500).json({
                        message: "Something went wrong! Please try again.",
                    });
                }
                else {
                    const updatedUser = JSON.parse((_a = req.body) === null || _a === void 0 ? void 0 : _a.updatedUser);
                    const checkUser = await prisma.user.findUnique({
                        where: {
                            id: (_b = req === null || req === void 0 ? void 0 : req.body) === null || _b === void 0 ? void 0 : _b.userId,
                        },
                    });
                    if (!checkUser) {
                        return res.status(404).send({ data: "User Not found" });
                    }
                    else {
                        const user = await prisma.user.update({
                            where: {
                                id: (_c = req === null || req === void 0 ? void 0 : req.body) === null || _c === void 0 ? void 0 : _c.userId,
                            },
                            data: {
                                name: updatedUser === null || updatedUser === void 0 ? void 0 : updatedUser.name,
                                photoURL: result === null || result === void 0 ? void 0 : result.secure_url,
                            },
                        });
                        return res.status(200).send({ user: user });
                    }
                }
            });
        }
        else {
            const updatedUser = JSON.parse((_a = req.body) === null || _a === void 0 ? void 0 : _a.updatedUser);
            const checkUser = await prisma.user.findUnique({
                where: {
                    id: (_b = req === null || req === void 0 ? void 0 : req.body) === null || _b === void 0 ? void 0 : _b.userId,
                },
            });
            if (!checkUser) {
                res.status(404).send({ data: "User Not found" });
                return;
            }
            else {
                const user = await prisma.user.update({
                    where: {
                        id: (_c = req === null || req === void 0 ? void 0 : req.body) === null || _c === void 0 ? void 0 : _c.userId,
                    },
                    data: {
                        name: updatedUser === null || updatedUser === void 0 ? void 0 : updatedUser.name,
                    },
                });
                res.status(200).send({ user: user });
                return;
            }
        }
    }
    catch (err) {
        console.log(err);
        res.status(500).send({ data: "Something went wrong." });
        return;
    }
};
export const deleteUser = async (req, res) => {
    var _a;
    try {
        const userId = (_a = req === null || req === void 0 ? void 0 : req.body) === null || _a === void 0 ? void 0 : _a.userId;
        const user = await prisma.user.findUnique({
            where: { id: userId },
        });
        if (!user) {
            res.status(404).send({ data: "User not found." });
            return;
        }
        await prisma.user.delete({ where: { id: userId } });
        res
            .status(200)
            .send({ data: "User and all related data deleted successfully." });
    }
    catch (err) {
        console.error("Error deleting user:", err);
        res.status(500).send({ data: "Something went wrong." });
    }
};
