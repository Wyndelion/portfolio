import './theme.js';
import { createShape } from './shape.js';

// Subpages: same shape (using the landing page's saved slider values), off to the side and dimmer.
createShape(document.getElementById('bg'), { side: 'right', dim: 0.8 });
