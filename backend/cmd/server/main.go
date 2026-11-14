package main

import (
	"github.com/pivoslavik/giga-buddy/backend/internal/server"
	"github.com/pivoslavik/giga-buddy/backend/internal/config"
	"log"
)

func main() {
	serverConfig,err := config.GetServerConfig()
	if err != nil {
		log.Fatalf("GetServerConfig: %v",err)
	}
	log.Println("Running on port 8080")
	log.Fatal(server.Run(serverConfig))
}
