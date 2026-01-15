import { Request, Response } from "express";
import cloudinary from "../utils/cloudinary.ts";
import { prisma } from "../utils/prismaClient.ts";

// Create a new User
export const createUser = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    // If image is uploaded
    if (req?.file) {
      cloudinary.uploader.upload(req.file.path, async function (err, result) {
        if (err) {
          console.log(err);
          return res.status(500).json({
            message: "Something went wrong! Please try again.",
          });
        }
        // If image upload was successful
        else {
          // Get user from request.
          const user = JSON.parse(req.body?.user);

          //Find if user exists in DB
          const checkUser = await prisma.user.findUnique({
            where: {
              email: user?.email,
            },
          });

          if (!checkUser) {
            // Create a user in DB
            const createdUser = await prisma.user.create({
              data: {
                firebaseUID: user?.uid,
                email: user?.email,
                name: user?.name,
                photoURL: result?.secure_url,
              },
            });

            // Send the createdUser
            res.status(200).send({ user: createdUser });
            return;
          } else {
            // Send the user in the DB
            res.status(200).send({ user: checkUser });
            return;
          }
        }
      });
    }
    // If image is not uploaded / google image used.
    else {
      const user = JSON.parse(req.body?.user);

      //Find if user exists in DB
      const checkUser = await prisma.user.findUnique({
        where: {
          email: user?.email,
        },
      });

      if (!checkUser) {
        // Create a user in DB
        const createdUser = await prisma.user.create({
          data: {
            firebaseUID: user?.uid,
            email: user?.email,
            name: user?.name,
            photoURL: user?.image,
          },
        });

        // Send the createdUser
        res.status(200).send({ user: createdUser });
        return;
      } else {
        // Send the user in the DB
        res.status(200).send({ user: checkUser });
        return;
      }
    }
  } catch (err) {
    console.log(err);
    res.status(500).send({ data: "Something went wrong." });
    return;
  }
};

// Get Current User from DB
export const getCurrentUser = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    // Get user info from request.
    const user = req.body?.user;

    // Get the user from DB
    const userInDB = await prisma.user.findUnique({
      where: {
        email: user?.email,
      },
    });

    // If user not present in DB
    if (!userInDB) {
      res.status(404).send({ data: "User does not exist." });
      return;
    }

    res.status(200).send({ user: userInDB });
    return;
  } catch (err) {
    console.log(err);
    res.status(500).send({ data: "Something went wrong." });
    return;
  }
};

// Get User information by email
export const getUserProfile = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    // Get email from request.
    const email = req.body?.email;

    // Get the user from DB
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

    // If user not present in DB
    if (!userInDB) {
      res.status(404).send({ data: "User does not exist." });
      return;
    }

    // sending user
    res.status(200).send({ user: userInDB });
    return;
  } catch (err) {
    console.log(err);
    res.status(500).send({ data: "Something went wrong." });
    return;
  }
};



// Update the User details - image and name are updateable
export const updateUser = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    // If image is uploaded
    if (req?.file) {
      cloudinary.uploader.upload(req.file.path, async function (err, result) {
        if (err) {
          console.log(err);
          return res.status(500).json({
            message: "Something went wrong! Please try again.",
          });
        }
        // If image upload was successful
        else {
          // Get user from request.
          const updatedUser = JSON.parse(req.body?.updatedUser);

          //Find if user exists in DB
          const checkUser = await prisma.user.findUnique({
            where: {
              id: req?.body?.userId,
            },
          });

          if (!checkUser) {
            // Send an error
            return res.status(404).send({ data: "User Not found" });
          } else {
            // Send the user in the DB
            const user = await prisma.user.update({
              where: {
                id: req?.body?.userId,
              },
              data: {
                name: updatedUser?.name,
                photoURL: result?.secure_url,
              },
            });
            return res.status(200).send({ user: user });
          }
        }
      });
    }
    // If image is not uploaded / google image used.
    else {
      // Get user from request.
      const updatedUser = JSON.parse(req.body?.updatedUser);

      //Find if user exists in DB
      const checkUser = await prisma.user.findUnique({
        where: {
          id: req?.body?.userId,
        },
      });

      if (!checkUser) {
        // Send an error
        res.status(404).send({ data: "User Not found" });
        return;
      } else {
        // Send the user in the DB
        const user = await prisma.user.update({
          where: {
            id: req?.body?.userId,
          },
          data: {
            name: updatedUser?.name,
          },
        });

        res.status(200).send({ user: user });
        return;
      }
    }
  } catch (err) {
    console.log(err);
    res.status(500).send({ data: "Something went wrong." });
    return;
  }
};

// Delete the user
export const deleteUser = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = req?.body?.userId;

    // Find the user along with their files and notes
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      res.status(404).send({ data: "User not found." });
      return;
    }

    // Delete the user
    await prisma.user.delete({ where: { id: userId } });

    res
      .status(200)
      .send({ data: "User and all related data deleted successfully." });
  } catch (err) {
    console.error("Error deleting user:", err);
    res.status(500).send({ data: "Something went wrong." });
  }
};