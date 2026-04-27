package redlib.backend.service;

public interface TranslationService {
    String translate(String text, String sourceLanguage, String targetLanguage);
}
