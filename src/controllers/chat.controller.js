'use strict';

const chatService = require('../services/chat.service');
const AppError = require('../utils/AppError');

async function askQuestion(req, res, next) {
  try {
    const { kundliId, question } = req.body;

    const { answer, remainingCredits, remainingQuestions } = await chatService.askQuestion({
      kundliId,
      question,
    });

    // Response shape matches the spec exactly (flat — no `data` wrapper).
    res.status(200).json({
      success: true,
      answer,
      remainingCredits,
      remainingQuestions,
    });
  } catch (err) {
    // The spec asks for this exact flat shape specifically for the
    // question-limit case, distinct from this API's normal nested
    // { error: { code, message } } convention used everywhere else.
    if (err instanceof AppError && err.code === 'QUESTION_LIMIT_REACHED') {
      return res.status(err.statusCode).json({
        success: false,
        code: err.code,
        message: err.message,
      });
    }
    return next(err);
  }
}

async function claimReward(req, res, next) {
  try {
    const { kundliId } = req.body;
    const status = await chatService.claimReward({ kundliId });
    res.status(200).json({ success: true, ...status });
  } catch (err) {
    next(err);
  }
}

async function getCreditStatus(req, res, next) {
  try {
    const { kundliId } = req.params;
    const status = await chatService.getCreditStatus({ kundliId });
    res.status(200).json({ success: true, ...status });
  } catch (err) {
    next(err);
  }
}

module.exports = { askQuestion, claimReward, getCreditStatus };
