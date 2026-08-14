// Command hashpass prints an Argon2id hash of a password (FSD §6 parameters),
// for seeding users in migrations and for operational password resets.
package main

import (
	"flag"
	"fmt"
	"os"

	"inventory/internal/pkg/auth"
)

func main() {
	password := flag.String("password", "", "plaintext password to hash")
	flag.Parse()

	if *password == "" {
		fmt.Fprintln(os.Stderr, "usage: hashpass -password <password>")
		os.Exit(2)
	}

	hash, err := auth.HashPassword(*password)
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to hash password: %v\n", err)
		os.Exit(1)
	}
	fmt.Println(hash)
}
