import { app } from './app';
import { config } from './config/index';

// Process bootstrap: the only place that opens a network listener.
app.listen(config.PORT, () => {
  console.log(`Madrasty server listening on port ${config.PORT}`);
});
