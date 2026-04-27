package redlib.backend;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Assertions;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import redlib.backend.dto.NotebookCategoryDTO;
import redlib.backend.dto.NotebookLoginDTO;
import redlib.backend.dto.NotebookNoteDTO;
import redlib.backend.dto.NotebookRegisterDTO;
import redlib.backend.dto.query.NotebookNoteQueryDTO;

import java.nio.charset.StandardCharsets;
import java.util.List;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

abstract class NotebookTestSupport {
    @Autowired
    protected MockMvc mockMvc;

    @Autowired
    protected ObjectMapper objectMapper;

    protected Cookie loginAsAlice() throws Exception {
        return login("alice0", "123456");
    }

    protected Cookie loginAsBob() throws Exception {
        return login("bobby0", "123456");
    }

    protected Cookie login(String username, String password) throws Exception {
        NotebookLoginDTO loginDTO = new NotebookLoginDTO();
        loginDTO.setUsername(username);
        loginDTO.setPassword(password);
        MvcResult result = mockMvc.perform(post("/api/notebook/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(loginDTO)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andReturn();
        Cookie cookie = result.getResponse().getCookie("accessToken");
        Assertions.assertNotNull(cookie);
        return cookie;
    }

    protected JsonNode register(String username, String password, String confirmPassword, boolean agreeToTerms) throws Exception {
        NotebookRegisterDTO registerDTO = new NotebookRegisterDTO();
        registerDTO.setUsername(username);
        registerDTO.setPassword(password);
        registerDTO.setConfirmPassword(confirmPassword);
        registerDTO.setAgreeToTerms(agreeToTerms);
        MvcResult result = mockMvc.perform(post("/api/notebook/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(registerDTO)))
                .andExpect(status().isOk())
                .andReturn();
        return json(result);
    }

    protected JsonNode json(MvcResult result) throws Exception {
        return objectMapper.readTree(result.getResponse().getContentAsString(StandardCharsets.UTF_8));
    }

    protected Integer addCategory(Cookie cookie, String name) throws Exception {
        NotebookCategoryDTO dto = new NotebookCategoryDTO();
        dto.setName(name);
        MvcResult result = mockMvc.perform(post("/api/notebook/categories/add")
                        .cookie(cookie)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(dto)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andReturn();
        return json(result).path("data").asInt();
    }

    protected Integer addNote(Cookie cookie, String title, String content, List<Integer> categoryIds) throws Exception {
        return addNote(cookie, title, content, null, categoryIds);
    }

    protected Integer addNote(Cookie cookie, String title, String content, String richContent, List<Integer> categoryIds) throws Exception {
        NotebookNoteDTO dto = new NotebookNoteDTO();
        dto.setTitle(title);
        dto.setContent(content);
        dto.setRichContent(richContent);
        dto.setCategoryIds(categoryIds);
        MvcResult result = mockMvc.perform(post("/api/notebook/notes/add")
                        .cookie(cookie)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(dto)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andReturn();
        return json(result).path("data").asInt();
    }

    protected JsonNode listNotes(Cookie cookie, String keyword, Integer categoryId) throws Exception {
        NotebookNoteQueryDTO queryDTO = new NotebookNoteQueryDTO();
        queryDTO.setCurrent(1);
        queryDTO.setPageSize(20);
        queryDTO.setKeyword(keyword);
        queryDTO.setCategoryId(categoryId);
        MvcResult result = mockMvc.perform(post("/api/notebook/notes/list")
                        .cookie(cookie)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(queryDTO)))
                .andExpect(status().isOk())
                .andReturn();
        return json(result);
    }

    protected JsonNode getNote(Cookie cookie, Integer noteId) throws Exception {
        MvcResult result = mockMvc.perform(get("/api/notebook/notes/get")
                        .cookie(cookie)
                        .param("id", String.valueOf(noteId)))
                .andExpect(status().isOk())
                .andReturn();
        return json(result);
    }
}
