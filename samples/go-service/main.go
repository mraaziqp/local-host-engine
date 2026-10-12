package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "3130"
	}
	host := os.Getenv("HOST")
	if host == "" {
		host = "127.0.0.1"
	}

	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"service": "Go High-Throughput Microservice",
			"status":  "healthy",
			"runtime": "Golang 1.22",
			"port":    port,
			"host":    host,
		})
	})

	addr := fmt.Sprintf("%s:%s", host, port)
	fmt.Printf("[Go Binary Service] Listening strictly on http://%s\n", addr)
	http.ListenAndServe(addr, nil)
}
