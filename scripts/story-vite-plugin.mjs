import { resolve } from 'node:path';
import { compileStory, documentPath } from './story-document.mjs';

// Also used by direct vinext/vite builds, so every entry point reads the document.
export function storyDocument(options = {}) {
  const source = resolve(options.source ?? documentPath);
  compileStory(options);
  return {
    name: 'borodin-story-document',
    configureServer(server) {
      server.watcher.add(source);
      const update = path => {
        if (resolve(path) !== source) return;
        try {
          compileStory(options);
          server.ws.send({ type: 'full-reload' });
        } catch (error) {
          server.config.logger.error(error.message);
          server.ws.send({ type: 'error', err: { message: error.message, stack: '', plugin: 'borodin-story-document' } });
        }
      };
      server.watcher.on('change', update);
      server.watcher.on('add', update);
      server.watcher.on('unlink', update);
      return () => server.httpServer?.once('close', () => {
        server.watcher.off('change', update);
        server.watcher.off('add', update);
        server.watcher.off('unlink', update);
      });
    },
  };
}
