import express from "express";
import { getList, getOne } from "./synthesis.controller.js";

const router = express.Router();

router.get("/", getList);
router.get("/:id", getOne);

export default router;
