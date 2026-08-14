package response

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"

	"github.com/go-playground/validator/v10"
	"github.com/labstack/echo/v4"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSuccess(t *testing.T) {
	e := echo.New()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	data := map[string]string{"foo": "bar"}
	meta := &Meta{PageSize: 10, NextCursor: "xyz"}

	err := Success(c, http.StatusOK, data, meta)
	assert.NoError(t, err)
	assert.Equal(t, http.StatusOK, rec.Code)

	var resp Response
	err = json.Unmarshal(rec.Body.Bytes(), &resp)
	assert.NoError(t, err)

	assert.True(t, resp.Success)
	assert.Equal(t, "bar", resp.Data.(map[string]any)["foo"])
	assert.Equal(t, 10, resp.Meta.PageSize)
	assert.Equal(t, "xyz", resp.Meta.NextCursor)
	assert.Nil(t, resp.Error)
}

func TestError(t *testing.T) {
	e := echo.New()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	details := []ErrorDetail{
		{Field: "sku", Message: "Not found", SKU: "SKU-999"},
	}

	err := Error(c, http.StatusBadRequest, "ERR_NOT_FOUND", "Item not found", details, "req-123")
	assert.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, rec.Code)

	var resp Response
	err = json.Unmarshal(rec.Body.Bytes(), &resp)
	assert.NoError(t, err)

	assert.False(t, resp.Success)
	assert.Nil(t, resp.Data)
	assert.Nil(t, resp.Meta)
	assert.NotNil(t, resp.Error)
	assert.Equal(t, "ERR_NOT_FOUND", resp.Error.Code)
	assert.Equal(t, "Item not found", resp.Error.Message)
	assert.Equal(t, "req-123", resp.Error.RequestID)
	assert.Len(t, resp.Error.Details, 1)
	assert.Equal(t, "sku", resp.Error.Details[0].Field)
	assert.Equal(t, "Not found", resp.Error.Details[0].Message)
	assert.Equal(t, "SKU-999", resp.Error.Details[0].SKU)
}

func TestValidationDetails(t *testing.T) {
	payload := struct {
		Username string `json:"username" validate:"required,min=3"`
		Password string `json:"password" validate:"required,min=12"`
	}{Username: "", Password: "short"}

	v := validator.New()
	v.RegisterTagNameFunc(func(fld reflect.StructField) string {
		return strings.SplitN(fld.Tag.Get("json"), ",", 2)[0]
	})
	err := v.Struct(payload)

	details := ValidationDetails(err)
	require.Len(t, details, 2)
	assert.Equal(t, "username", details[0].Field)
	assert.Equal(t, "is required", details[0].Message)
	assert.Equal(t, "password", details[1].Field)
	assert.Equal(t, "must be at least 12 characters long", details[1].Message)
}

func TestValidationDetails_NonValidationError(t *testing.T) {
	details := ValidationDetails(assert.AnError)
	require.Len(t, details, 1)
	assert.Equal(t, "body", details[0].Field)
}
