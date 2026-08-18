import React from 'react';
import { Result, Button } from 'antd';
import { useNavigate } from 'react-router-dom';

export const NotFoundPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <Result
      status="404"
      title="404"
      subTitle="Maaf, halaman yang Anda cari tidak ditemukan."
      extra={
        <Button type="primary" onClick={() => navigate('/dashboard')}>
          Kembali ke Dashboard
        </Button>
      }
    />
  );
};
