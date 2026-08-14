import React from 'react';
import { Result, Button } from 'antd';
import { useNavigate } from 'react-router-dom';

export const ForbiddenPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <Result
      status="403"
      title="403"
      subTitle="Maaf, Anda tidak memiliki hak akses (izin) untuk membuka halaman ini."
      extra={
        <Button type="primary" onClick={() => navigate('/dashboard')}>
          Kembali ke Dashboard
        </Button>
      }
    />
  );
};
