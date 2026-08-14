// Package validation provides an echo.Validator backed by go-playground/validator,
// configured so field names in error details follow the JSON field names of the DTOs.
package validation

import (
	"reflect"
	"strings"

	"github.com/go-playground/validator/v10"
)

// Validator implements echo.Validator and delegates to go-playground/validator.
type Validator struct {
	v *validator.Validate
}

// New creates a Validator whose reported field names are the DTO JSON names.
func New() *Validator {
	v := validator.New()
	v.RegisterTagNameFunc(func(fld reflect.StructField) string {
		name := strings.SplitN(fld.Tag.Get("json"), ",", 2)[0]
		if name == "" || name == "-" {
			return fld.Name
		}
		return name
	})
	return &Validator{v: v}
}

// Validate implements echo.Validator. It returns validator.ValidationErrors
// (wrapped in a *validator.InvalidValidationError for non-struct targets).
func (val *Validator) Validate(i any) error {
	return val.v.Struct(i)
}
