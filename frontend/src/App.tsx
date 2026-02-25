/**
 * Main App component with routing and providers.
 */

import { ErrorBoundary } from './components/ErrorBoundary';
import { BoardPage } from './components/BoardPage';

function App() {
  return (
    <ErrorBoundary>
      <BoardPage />
    </ErrorBoundary>
  );
}

export default App;

