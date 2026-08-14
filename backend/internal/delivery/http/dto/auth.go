package dto

// LoginRequest is the request payload for POST /auth/login.
// Password has no length rule here: enforcing the policy on login would leak it.
type LoginRequest struct {
	Username string `json:"username" validate:"required,min=3,max=50"`
	Password string `json:"password" validate:"required"`
}

// LoginResponse is the response payload for a successful login.
type LoginResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	TokenType    string `json:"token_type"`
}

// RefreshRequest is the request payload for POST /auth/refresh.
type RefreshRequest struct {
	RefreshToken string `json:"refresh_token" validate:"required"`
}

// RefreshResponse is the response payload for a successful token rotation.
type RefreshResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	TokenType    string `json:"token_type"`
}

// RegisterRequest is the request payload for POST /auth/register.
// Password minimum is 12 characters per FSD §6.
type RegisterRequest struct {
	Username string `json:"username" validate:"required,min=3,max=50"`
	Email    string `json:"email" validate:"required,email,max=150"`
	FullName string `json:"full_name" validate:"required,min=1,max=150"`
	Password string `json:"password" validate:"required,min=12,max=72"`
}

// RegisterResponse is the response payload for a successful registration.
type RegisterResponse struct {
	ID       int64  `json:"id"`
	Username string `json:"username"`
	FullName string `json:"full_name"`
}
