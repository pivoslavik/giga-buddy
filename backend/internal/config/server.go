package config

import(
	"github.com/joho/godotenv"
	"os"
	"fmt"
	"strconv"
)

type ServerConfig struct {
	DatabaseURL string
	JWTSecret []byte 
	MessagesPerUser int
}

func GetServerConfig() (ServerConfig,error){
	godotenv.Load()
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		return ServerConfig{},fmt.Errorf("GetServerConfig: DATABASE_URL environment variable is not set")
	}

	jwtSecret := os.Getenv("JWT_SECRET")
	if jwtSecret == "" {
		return ServerConfig{},fmt.Errorf("GetServerConfig: JWT_SECRET environment variable is not set")
	}
	
	messagesPerUserString := os.Getenv("MESSAGES_PER_USER")
	if messagesPerUserString == "" {
		return ServerConfig{},fmt.Errorf("GetServerConfig: MESSAGES_PER_USER environment variable is not set")
	}
	messagesPerUser,err := strconv.Atoi(messagesPerUserString)
	if err != nil {
		return ServerConfig{},fmt.Errorf("GetServerConfig: invalid MESSAGES_PER_USER value")
	}

	return ServerConfig{
		DatabaseURL: databaseURL,
		JWTSecret: []byte(jwtSecret),
		MessagesPerUser: messagesPerUser,
	},nil
}
