package main

import (
	"github.com/pivoslavik/giga-buddy/backend/internal/config"
	"github.com/pivoslavik/giga-buddy/backend/internal/server"
	"log"
)

func main() {
	serverConfig, err := config.GetServerConfig()
	if err != nil {
		log.Fatal(err)
	}
	log.Println("Running on port 8080")
	log.Fatal(server.Run(serverConfig))
}
