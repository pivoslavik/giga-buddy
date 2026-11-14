package main

import (
	"github.com/joho/godotenv"
	"github.com/pivoslavik/giga-buddy/backend/internal/server"
	"log"
	"os"
)

func main() {
	// TODO: solve the problem with GIN proxy trust

	//getting environment variables
	godotenv.Load()
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		log.Fatal("DATABASE_URL environment variable is not set")
	}
	jwtSecret := os.Getenv("JWT_SECRET")
	if jwtSecret == "" {
		log.Fatal("JWT_SECRET environment variable is not set")
	}

	log.Println("Running on port 8080")
	log.Fatal(server.Run(databaseURL, []byte(jwtSecret)))
}
