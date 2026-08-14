package validation

import (
	"errors"
	"testing"

	"github.com/go-playground/validator/v10"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type testPayload struct {
	Username string `json:"username" validate:"required,min=3,max=50"`
	Password string `json:"password" validate:"required,min=12,max=72"`
	Kind     string `json:"kind" validate:"omitempty,oneof=a b c"`
}

func TestValidator_ValidPayload(t *testing.T) {
	v := New()
	err := v.Validate(&testPayload{Username: "alice", Password: "correctPassword123!"})
	require.NoError(t, err)
}

func TestValidator_ReportsJSONFieldNames(t *testing.T) {
	v := New()
	err := v.Validate(&testPayload{Username: "", Password: "x"})

	var vErrs validator.ValidationErrors
	require.True(t, errors.As(err, &vErrs))

	fields := map[string]string{}
	for _, fe := range vErrs {
		fields[fe.Field()] = fe.Tag()
	}
	assert.Equal(t, "required", fields["username"], "field must use the JSON name, not the Go name")
	assert.Equal(t, "min", fields["password"])
}

func TestValidator_OneOf(t *testing.T) {
	v := New()
	err := v.Validate(&testPayload{Username: "alice", Password: "correctPassword123!", Kind: "zzz"})

	var vErrs validator.ValidationErrors
	require.True(t, errors.As(err, &vErrs))
	require.Len(t, vErrs, 1)
	assert.Equal(t, "kind", vErrs[0].Field())
	assert.Equal(t, "oneof", vErrs[0].Tag())
}
