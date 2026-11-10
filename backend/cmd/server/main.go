package main

import (
	"github.com/pivoslavik/giga-buddy/internal/server"
	"log"
)

func main() {
	log.Fatal(server.Run())
}
