package models

import "fmt"

type DocumentID int64

type DocumentCategory string

const (
	StartWork     DocumentCategory = "start_work"
	Development   DocumentCategory = "development"
	WorkProcesses DocumentCategory = "work_processes"
	TeamValues    DocumentCategory = "team_values"
	Contacts      DocumentCategory = "contacts"
	AiAnswers     DocumentCategory = "ai_answers"
	Company       DocumentCategory = "company"
)

func CheckDocumentCategory(category string) error {
	switch DocumentCategory(category) {
	case StartWork, Development, WorkProcesses, TeamValues, Contacts, AiAnswers, Company:
		return nil
	default:
		return fmt.Errorf("CheckDocumentCategory: invalid document category: %s", category)
	}
}

type Document struct {
	ID          DocumentID       `db:"id"`
	Title       string           `db:"title"`
	Description string           `db:"description"`
	Text        string           `db:"text"`
	Category    DocumentCategory `db:"category"`
}

type ShortDocument struct {
	ID          DocumentID       `db:"id" json:"id"`
	Title       string           `db:"title" json:"title"`
	Description string           `db:"description" json:"description"`
	Category    DocumentCategory `db:"category" json:"category"`
}
