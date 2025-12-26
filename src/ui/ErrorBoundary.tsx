import React from 'react';

type Props = { children: React.ReactNode; };

type State = { error?: Error };

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {};
  }
  static getDerivedStateFromError(error: Error): State {
    return { error };
  }
  componentDidCatch(error: Error) {
    // Keep console output for debugging; avoids white screen.
    console.error('UI crashed:', error);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="card" style={{borderColor:'rgba(255,80,80,.35)'}}>
          <div style={{fontWeight:800, marginBottom:6}}>Something went wrong in this screen.</div>
          <div className="small muted" style={{whiteSpace:'pre-wrap'}}>
            {this.state.error.message}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
