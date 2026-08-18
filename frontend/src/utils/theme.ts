import { ThemeConfig } from 'antd';

export const simbarTheme: ThemeConfig = {
  token: {
    colorPrimary: '#0052cc', // Corporate Deep Blue
    colorSuccess: '#36b37e',
    colorWarning: '#ffab00',
    colorError: '#ff5630',
    colorInfo: '#0065ff',
    borderRadius: 6,
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    colorBgContainer: '#ffffff',
  },
  components: {
    Layout: {
      headerBg: '#ffffff',
      siderBg: '#001529', // Dark Navy Sider
      triggerBg: '#002140',
    },
    Menu: {
      darkItemBg: '#001529',
      darkItemSelectedBg: '#0052cc',
      darkItemHoverBg: '#002140',
    },
    Button: {
      borderRadius: 6,
      controlHeight: 38,
    },
    Card: {
      borderRadiusLG: 8,
    },
    Table: {
      headerBg: '#fafafa',
      headerColor: '#172b4d',
    },
  },
};
