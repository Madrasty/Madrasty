import { DrizzleLiveClassesRepository } from './live-classes.repository';
import { LiveClassesService } from './live-classes.service';
import { buildRtcProvider } from './providers/registry';

// Composition helper: assembles the live-classes service from its repository +
// the realtime provider selected by config (doc 01 §5).
export function buildLiveClassesService(): LiveClassesService {
  return new LiveClassesService(new DrizzleLiveClassesRepository(), buildRtcProvider());
}
