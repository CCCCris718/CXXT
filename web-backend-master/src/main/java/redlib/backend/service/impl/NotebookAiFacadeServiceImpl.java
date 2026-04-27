package redlib.backend.service.impl;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.Assert;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;
import redlib.backend.dto.NotebookSummarizeRequestDTO;
import redlib.backend.dto.NotebookTranslateRequestDTO;
import redlib.backend.service.NotebookAiFacadeService;
import redlib.backend.service.NotebookNoteService;
import redlib.backend.service.SpeechToTextService;
import redlib.backend.service.SummaryService;
import redlib.backend.service.TranslationService;

@Service
public class NotebookAiFacadeServiceImpl implements NotebookAiFacadeService {
    @Autowired
    private TranslationService translationService;

    @Autowired
    private SummaryService summaryService;

    @Autowired
    private SpeechToTextService speechToTextService;

    @Autowired
    private NotebookNoteService notebookNoteService;

    @Override
    public String translate(NotebookTranslateRequestDTO requestDTO) {
        Assert.notNull(requestDTO, "翻译请求不能为空");
        Assert.hasText(requestDTO.getTargetLanguage(), "目标语言不能为空");
        return translationService.translate(resolveText(requestDTO.getNoteId(), requestDTO.getText()), requestDTO.getSourceLanguage(), requestDTO.getTargetLanguage());
    }

    @Override
    public String summarize(NotebookSummarizeRequestDTO requestDTO) {
        Assert.notNull(requestDTO, "摘要请求不能为空");
        return summaryService.summarize(resolveText(requestDTO.getNoteId(), requestDTO.getText()), requestDTO.getMaxLength());
    }

    @Override
    public String transcribe(MultipartFile file, String language) {
        return speechToTextService.transcribe(file, language);
    }

    private String resolveText(Integer noteId, String text) {
        if (StringUtils.hasText(text)) {
            return text;
        }
        Assert.notNull(noteId, "文本内容或笔记ID至少需要提供一个");
        return notebookNoteService.getOwnedNoteContent(noteId);
    }
}
