package redlib.backend;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;
import redlib.backend.dto.NotebookNoteDTO;
import redlib.backend.mapper.NotebookNoteMapper;
import redlib.backend.model.NotebookNote;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class NotebookNoteControllerTests extends NotebookTestSupport {
    @Autowired
    private NotebookNoteMapper notebookNoteMapper;

    @Test
    void shouldCreateUpdateListDeleteAndIsolateNotes() throws Exception {
        Cookie alice = loginAsAlice();
        Integer study = addCategory(alice, "study");
        Integer todo = addCategory(alice, "todo");
        Integer noteId = addNote(alice, "linear algebra homework", "organize the homework list", List.of(study, todo));

        JsonNode created = getNote(alice, noteId);
        assertThat(created.path("success").asBoolean()).isTrue();
        assertThat(created.path("data").path("categories").size()).isEqualTo(2);
        assertThat(created.path("data").path("richContent").asText()).isEqualTo("<p>organize the homework list</p>");

        NotebookNoteDTO updateDTO = new NotebookNoteDTO();
        updateDTO.setId(noteId);
        updateDTO.setTitle("linear algebra homework updated");
        updateDTO.setContent("finish chapter one and chapter two");
        updateDTO.setCategoryIds(List.of(todo));
        JsonNode updated = json(mockMvc.perform(post("/api/notebook/notes/update")
                        .cookie(alice)
                        .contentType(APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(updateDTO)))
                .andExpect(status().isOk())
                .andReturn());
        assertThat(updated.path("success").asBoolean()).isTrue();

        JsonNode listByKeyword = listNotes(alice, "updated", null);
        assertThat(listByKeyword.path("data").path("total").asInt()).isEqualTo(1);

        JsonNode listByCategory = listNotes(alice, null, todo);
        assertThat(listByCategory.path("data").path("total").asInt()).isEqualTo(1);

        Cookie bob = loginAsBob();
        JsonNode bobList = listNotes(bob, null, null);
        assertThat(bobList.path("data").path("total").asInt()).isZero();

        JsonNode deleted = json(mockMvc.perform(post("/api/notebook/notes/delete")
                        .cookie(alice)
                        .contentType(APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(List.of(noteId))))
                .andExpect(status().isOk())
                .andReturn());
        assertThat(deleted.path("success").asBoolean()).isTrue();

        JsonNode afterDelete = listNotes(alice, null, null);
        assertThat(afterDelete.path("data").path("total").asInt()).isZero();
    }

    @Test
    void shouldPersistSanitizedRichContentAndSearchByExtractedPlainText() throws Exception {
        Cookie alice = loginAsAlice();
        Integer study = addCategory(alice, "rich-text");
        String richContent = """
                <h1 style="font-family:'微软雅黑';font-size:16px;text-align:center;color:red">Heading</h1>
                <p style="font-family:宋体;font-size:18px;text-align:left;color:blue">
                    <span style="font-family:黑体;font-size:20px;color:red">Hello</span><strong> world</strong>
                </p>
                """;

        Integer noteId = addNote(alice, "rich note", "legacy content should be ignored", richContent, List.of(study));

        NotebookNote storedNote = notebookNoteMapper.selectById(noteId);
        assertThat(storedNote.getContent()).isEqualTo("Heading\nHello world");
        assertThat(storedNote.getRichContent()).contains("font-family:Microsoft YaHei");
        assertThat(storedNote.getRichContent()).contains("font-family:SimSun");
        assertThat(storedNote.getRichContent()).contains("font-family:SimHei");
        assertThat(storedNote.getRichContent()).doesNotContain("color:");

        JsonNode noteDetail = getNote(alice, noteId);
        assertThat(noteDetail.path("success").asBoolean()).isTrue();
        assertThat(noteDetail.path("data").path("content").asText()).isEqualTo("Heading\nHello world");
        assertThat(noteDetail.path("data").path("richContent").asText()).contains("text-align:center");

        JsonNode listByKeyword = listNotes(alice, "Hello world", null);
        assertThat(listByKeyword.path("data").path("total").asInt()).isEqualTo(1);
        JsonNode listedNote = listByKeyword.path("data").path("list").get(0);
        assertThat(listedNote.path("content").asText()).isEqualTo("Heading\nHello world");
        assertThat(listedNote.path("richContent").isMissingNode() || listedNote.path("richContent").isNull()).isTrue();
    }

    @Test
    void shouldReturnFallbackRichContentForLegacyPlainTextNotes() throws Exception {
        Cookie alice = loginAsAlice();
        Integer noteId = addNote(alice, "legacy note", "Line 1\nLine 2\n\nLine 3", List.of());

        NotebookNote storedNote = notebookNoteMapper.selectById(noteId);
        assertThat(storedNote.getRichContent()).isNull();

        JsonNode noteDetail = getNote(alice, noteId);
        assertThat(noteDetail.path("success").asBoolean()).isTrue();
        assertThat(noteDetail.path("data").path("richContent").asText()).contains("<p>Line 1<br>Line 2</p>");
        assertThat(noteDetail.path("data").path("richContent").asText()).contains("<p>Line 3</p>");
    }

    @Test
    void shouldPersistFavoriteWithoutChangingContent() throws Exception {
        Cookie alice = loginAsAlice();
        Integer noteId = addNote(alice, "favorite note", "keep this content", List.of());

        NotebookNoteDTO favoriteDTO = new NotebookNoteDTO();
        favoriteDTO.setId(noteId);
        favoriteDTO.setFavorite(true);
        JsonNode favoriteResult = json(mockMvc.perform(post("/api/notebook/notes/favorite")
                        .cookie(alice)
                        .contentType(APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(favoriteDTO)))
                .andExpect(status().isOk())
                .andReturn());
        assertThat(favoriteResult.path("success").asBoolean()).isTrue();

        NotebookNote storedNote = notebookNoteMapper.selectById(noteId);
        assertThat(storedNote.getFavorite()).isTrue();
        assertThat(storedNote.getContent()).isEqualTo("keep this content");

        JsonNode listedNote = listNotes(alice, null, null).path("data").path("list").get(0);
        assertThat(listedNote.path("favorite").asBoolean()).isTrue();
    }

    @Test
    void shouldRejectUnsafeRichContent() throws Exception {
        Cookie alice = loginAsAlice();
        NotebookNoteDTO eventHandlerNote = new NotebookNoteDTO();
        eventHandlerNote.setTitle("unsafe note");
        eventHandlerNote.setRichContent("<p onclick=\"alert(1)\">bad</p>");

        JsonNode eventHandlerResult = json(mockMvc.perform(post("/api/notebook/notes/add")
                        .cookie(alice)
                        .contentType(APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(eventHandlerNote)))
                .andExpect(status().isOk())
                .andReturn());
        assertThat(eventHandlerResult.path("success").asBoolean()).isFalse();
        assertThat(eventHandlerResult.path("message").asText()).contains("Event handler attributes are not allowed");

        NotebookNoteDTO javascriptUrlNote = new NotebookNoteDTO();
        javascriptUrlNote.setTitle("unsafe link");
        javascriptUrlNote.setRichContent("<span data-url=\"javascript:alert(1)\">bad</span>");

        JsonNode javascriptUrlResult = json(mockMvc.perform(post("/api/notebook/notes/add")
                        .cookie(alice)
                        .contentType(APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(javascriptUrlNote)))
                .andExpect(status().isOk())
                .andReturn());
        assertThat(javascriptUrlResult.path("success").asBoolean()).isFalse();
        assertThat(javascriptUrlResult.path("message").asText()).contains("javascript: URLs are not allowed");

        NotebookNoteDTO scriptTagNote = new NotebookNoteDTO();
        scriptTagNote.setTitle("unsafe script");
        scriptTagNote.setRichContent("<p>ok</p><script>alert(1)</script>");

        JsonNode scriptTagResult = json(mockMvc.perform(post("/api/notebook/notes/add")
                        .cookie(alice)
                        .contentType(APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(scriptTagNote)))
                .andExpect(status().isOk())
                .andReturn());
        assertThat(scriptTagResult.path("success").asBoolean()).isFalse();
        assertThat(scriptTagResult.path("message").asText()).contains("Script tags are not allowed");
    }
}
