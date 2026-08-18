import { Component, ErrorInfo, ReactNode } from 'react';
import { Card, Button, Typography, Space, Alert } from 'antd';
import { WarningOutlined, ReloadOutlined, BugOutlined } from '@ant-design/icons';

const { Title, Paragraph, Text } = Typography;

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  showDetails: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    showDetails: false,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    console.error('Uncaught Error Boundary:', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div
          data-testid="error-boundary-fallback"
          style={{
            padding: 32,
            minHeight: '80vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Card
            style={{ maxWidth: 640, width: '100%', boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}
            variant="borderless"
          >
            <Space direction="vertical" size="large" style={{ width: '100%', textAlign: 'center' }}>
              <WarningOutlined style={{ fontSize: 56, color: '#ff4d4f' }} />

              <div>
                <Title level={3} style={{ margin: 0 }}>
                  Terjadi Kesalahan Sistem (FE-901)
                </Title>
                <Paragraph type="secondary" style={{ marginTop: 8 }}>
                  Aplikasi mengalami kendala yang tidak terduga. Data Anda tetap aman.
                </Paragraph>
              </div>

              <Alert
                message={this.state.error?.message || 'Unknown Application Error'}
                type="error"
                showIcon
              />

              <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
                <Button
                  type="primary"
                  icon={<ReloadOutlined />}
                  onClick={this.handleReload}
                  data-testid="btn-reload-boundary"
                >
                  Muat Ulang Halaman
                </Button>

                <Button
                  icon={<BugOutlined />}
                  onClick={() => this.setState((prev) => ({ showDetails: !prev.showDetails }))}
                  data-testid="btn-toggle-details"
                >
                  {this.state.showDetails ? 'Sembunyikan Details' : 'Lihat Detail Error'}
                </Button>

                <Button onClick={this.handleReset} data-testid="btn-retry-boundary">
                  Coba Lagi
                </Button>
              </div>

              {this.state.showDetails && (
                <Card type="inner" style={{ textAlign: 'left', background: '#f5f5f5' }}>
                  <Text code style={{ fontSize: 11, whiteSpace: 'pre-wrap', display: 'block' }}>
                    {this.state.errorInfo?.componentStack}
                  </Text>
                </Card>
              )}
            </Space>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
