import { Window } from 'happy-dom';

// Create and setup happy-dom window
const window = new Window();
const document = window.document;

// Make DOM globals available
global.window = window as any;
global.document = document as any;
global.navigator = window.navigator as any;
global.HTMLElement = window.HTMLElement as any;
global.Element = window.Element as any;
