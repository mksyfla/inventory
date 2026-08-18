import React, { useState } from "react";
import { Card, Input, Button, Typography, Alert, Checkbox, Space } from "antd";
import { UserOutlined, LockOutlined, SafetyOutlined, AuditOutlined } from "@ant-design/icons";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuthStore } from "../store/useAuthStore";
import { authService } from "../api/services/auth";

const { Title, Text } = Typography;

const loginSchema = z.object({
    username: z.string().min(3, "Username minimal 3 karakter"),
    password: z.string().min(6, "Kata sandi minimal 6 karakter"),
    mfaCode: z.string().optional(),
    rememberMe: z.boolean().optional(),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export const LoginPage: React.FC = () => {
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [showMfa, setShowMfa] = useState(false);

    const navigate = useNavigate();
    const location = useLocation();
    const setSession = useAuthStore((state) => state.setSession);

    const from = (location.state as any)?.from?.pathname || "/dashboard";

    const {
        control,
        handleSubmit,
        formState: { errors },
    } = useForm<LoginFormValues>({
        resolver: zodResolver(loginSchema),
        defaultValues: {
            username: "admin",
            password: "Admin@123456",
            rememberMe: true,
        },
    });

    const onSubmit = async (values: LoginFormValues) => {
        setLoading(true);
        setErrorMsg(null);

        try {
            const pair = await authService.login({
                username: values.username,
                password: values.password,
            });
            setSession(pair.access_token, pair.refresh_token);
            navigate(from, { replace: true });
        } catch {
            setErrorMsg("Username atau kata sandi tidak sesuai.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div
            data-testid="login-page"
            style={{
                minHeight: "100vh",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                background: "linear-gradient(135deg, #001529 0%, #002140 50%, #0052cc 100%)",
                padding: 20,
            }}
        >
            <Card
                style={{
                    width: "100%",
                    maxWidth: 420,
                    borderRadius: 12,
                    boxShadow: "0 12px 32px rgba(0, 0, 0, 0.25)",
                }}
            >
                <div style={{ textAlign: "center", marginBottom: 24 }}>
                    <Space align="center" style={{ marginBottom: 8 }}>
                        <AuditOutlined style={{ fontSize: 36, color: "#0052cc" }} />
                        <Title level={2} style={{ margin: 0, fontWeight: 800, letterSpacing: 1 }}>
                            SIMBAR
                        </Title>
                    </Space>
                    <div>
                        <Text type="secondary">Sistem Manajemen Barang & Distribusi (PERURI)</Text>
                    </div>
                </div>

                {errorMsg && (
                    <Alert
                        message={errorMsg}
                        type="error"
                        showIcon
                        style={{ marginBottom: 20 }}
                        data-testid="login-error-alert"
                    />
                )}

                <form onSubmit={handleSubmit(onSubmit)} data-testid="login-form">
                    {/* Username Field */}
                    <div style={{ marginBottom: 16 }}>
                        <label style={{ display: "block", marginBottom: 6, fontWeight: 500 }}>
                            Username / Email
                        </label>
                        <Controller
                            name="username"
                            control={control}
                            render={({ field }) => (
                                <Input
                                    {...field}
                                    prefix={<UserOutlined style={{ color: "rgba(0,0,0,.45)" }} />}
                                    placeholder="Masukkan username atau email"
                                    size="large"
                                    status={errors.username ? "error" : ""}
                                    data-testid="input-username"
                                />
                            )}
                        />
                        {errors.username && (
                            <Text type="danger" style={{ fontSize: 12 }}>
                                {errors.username.message}
                            </Text>
                        )}
                    </div>

                    {/* Password Field */}
                    <div style={{ marginBottom: 16 }}>
                        <label style={{ display: "block", marginBottom: 6, fontWeight: 500 }}>
                            Kata Sandi
                        </label>
                        <Controller
                            name="password"
                            control={control}
                            render={({ field }) => (
                                <Input.Password
                                    {...field}
                                    prefix={<LockOutlined style={{ color: "rgba(0,0,0,.45)" }} />}
                                    placeholder="Masukkan kata sandi"
                                    size="large"
                                    status={errors.password ? "error" : ""}
                                    data-testid="input-password"
                                />
                            )}
                        />
                        {errors.password && (
                            <Text type="danger" style={{ fontSize: 12 }}>
                                {errors.password.message}
                            </Text>
                        )}
                    </div>

                    {/* Optional MFA / 2FA TOTP Toggle */}
                    {showMfa && (
                        <div style={{ marginBottom: 16 }}>
                            <label style={{ display: "block", marginBottom: 6, fontWeight: 500 }}>
                                Kode 2FA / TOTP (6 Digit)
                            </label>
                            <Controller
                                name="mfaCode"
                                control={control}
                                render={({ field }) => (
                                    <Input
                                        {...field}
                                        prefix={
                                            <SafetyOutlined style={{ color: "rgba(0,0,0,.45)" }} />
                                        }
                                        placeholder="Contoh: 123456"
                                        size="large"
                                        maxLength={6}
                                        data-testid="input-mfa"
                                    />
                                )}
                            />
                        </div>
                    )}

                    <div
                        style={{
                            display: "flex",
                            justifyContent: "space-between",
                            marginBottom: 24,
                            alignItems: "center",
                        }}
                    >
                        <Controller
                            name="rememberMe"
                            control={control}
                            render={({ field }) => (
                                <Checkbox
                                    checked={field.value}
                                    onChange={(e) => field.onChange(e.target.checked)}
                                >
                                    Ingat Saya
                                </Checkbox>
                            )}
                        />
                        <Button
                            type="link"
                            size="small"
                            style={{ padding: 0 }}
                            onClick={() => setShowMfa(!showMfa)}
                        >
                            {showMfa ? "Sembunyikan 2FA" : "Gunakan 2FA"}
                        </Button>
                    </div>

                    <Button
                        type="primary"
                        htmlType="submit"
                        size="large"
                        block
                        loading={loading}
                        data-testid="btn-login-submit"
                        style={{ fontWeight: 600, height: 44 }}
                    >
                        Masuk Aplikasi
                    </Button>
                </form>
            </Card>
        </div>
    );
};
