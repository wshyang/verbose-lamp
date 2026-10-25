import express, { type ErrorRequestHandler, type Express, type RequestHandler } from 'express';
import { FORMAT_CATALOG } from '../shared/contracts.js';
import { AppError } from './errors.js';
import type { TournamentDatabase } from './db/database.js';
import {
  parseAwardPointsInput,
  parseFinalizeMatchInput,
  parseIdentifier,
  parseLiveScoreInput,
  parseReasonInput,
  parseStageMatchInput,
  parseWeatherInput,
} from './http/parse.js';
import { MatchService } from './tournaments/match-service.js';
import { PointsService } from './tournaments/points-service.js';
import { TournamentService } from './tournaments/service.js';
import { parseCreateTournamentInput, parsePreviewInput } from './tournaments/validation.js';

export function createApp(db: TournamentDatabase): Express {
  const app = express();
  const tournaments = new TournamentService(db);
  const matches = new MatchService(db);
  const points = new PointsService(db);
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));
  app.get('/api/health', (_request, response) => response.json({ status: 'ok' }));
  app.get('/api/formats', (_request, response) => response.json(FORMAT_CATALOG));
  app.get('/api/tournaments', endpoint(async (_request, response) => {
    response.json(await tournaments.list());
  }));
  app.post('/api/simulations', endpoint(async (request, response) => {
    response.json(await tournaments.preview(parsePreviewInput(request.body)));
  }));
  app.post('/api/tournaments', endpoint(async (request, response) => {
    response.status(201).json(await tournaments.create(parseCreateTournamentInput(request.body)));
  }));
  app.get('/api/tournaments/:tournamentId', endpoint(async (request, response) => {
    response.json(await tournaments.get(parseIdentifier(request.params.tournamentId)));
  }));
  app.patch('/api/tournaments/:tournamentId/resources', endpoint(async (request, response) => {
    response.json(await tournaments.changeResources(
      parseIdentifier(request.params.tournamentId),
      parseWeatherInput(request.body),
    ));
  }));
  app.post('/api/tournaments/:tournamentId/close', endpoint(async (request, response) => {
    response.json(await tournaments.close(
      parseIdentifier(request.params.tournamentId),
      parseReasonInput(request.body),
    ));
  }));
  app.post('/api/tournaments/:tournamentId/matches', endpoint(async (request, response) => {
    response.status(201).json(await matches.stage(
      parseIdentifier(request.params.tournamentId),
      parseStageMatchInput(request.body),
    ));
  }));
  app.post('/api/tournaments/:tournamentId/matches/:matchId/score', endpoint(async (request, response) => {
    response.json(await matches.updateLiveScore(
      parseIdentifier(request.params.tournamentId),
      parseIdentifier(request.params.matchId),
      parseLiveScoreInput(request.body),
    ));
  }));
  app.post('/api/tournaments/:tournamentId/matches/:matchId/finalize', endpoint(async (request, response) => {
    response.json(await matches.finalize(
      parseIdentifier(request.params.tournamentId),
      parseIdentifier(request.params.matchId),
      parseFinalizeMatchInput(request.body),
    ));
  }));
  app.post('/api/tournaments/:tournamentId/points', endpoint(async (request, response) => {
    response.status(201).json(await points.award(
      parseIdentifier(request.params.tournamentId),
      parseAwardPointsInput(request.body),
    ));
  }));
  app.post('/api/tournaments/:tournamentId/points/:entryId/void', endpoint(async (request, response) => {
    response.status(201).json(await points.voidAward(
      parseIdentifier(request.params.tournamentId),
      parseIdentifier(request.params.entryId),
      parseReasonInput(request.body),
    ));
  }));
  app.use(errorHandler);
  return app;
}

function endpoint(handler: (request: express.Request, response: express.Response) => Promise<void>): RequestHandler {
  return (request, response, next) => {
    void handler(request, response).catch(next);
  };
}

const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
  if (error instanceof AppError) {
    response.status(error.status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  if (isMalformedJson(error)) {
    response.status(400).json({
      error: { code: 'INVALID_JSON', message: 'Request body must be valid JSON.' },
    });
    return;
  }
  response.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'The request could not be completed.' },
  });
};

function isMalformedJson(error: unknown): boolean {
  return error instanceof SyntaxError && 'status' in error && error.status === 400;
}
