// Package openapi embeds the OpenAPI 3.1 specification (contract-first per FSD §1.2).
package openapi

import _ "embed"

// SpecYAML holds the canonical OpenAPI 3.1 specification.
//
//go:embed openapi.yaml
var SpecYAML []byte
