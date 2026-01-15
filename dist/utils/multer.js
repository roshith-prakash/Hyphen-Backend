import multer from "multer";
const storage = multer.diskStorage({
    filename: function (_, file, cb) {
        cb(null, Date.now() + file.originalname);
    },
});
const upload = multer({ storage: storage });
export default upload;
