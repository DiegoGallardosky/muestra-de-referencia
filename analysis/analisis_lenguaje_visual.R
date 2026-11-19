# ============================================================
# ANALISIS DEL LENGUAJE VISUAL — MUESTRA DE REFERENCIA
# ============================================================
set.seed(20261119)

# install.packages(c("readr","dplyr","tidyr","ggplot2","ca","FactoMineR",
#                    "factoextra","vegan","permute","igraph"))

suppressPackageStartupMessages({
  library(readr); library(dplyr); library(tidyr); library(ggplot2)
  library(ca); library(FactoMineR); library(factoextra)
  library(vegan); library(permute); library(igraph)
})

base_dir <- "."
fields <- read_csv(file.path(base_dir, "field_scheme_binary_primary.csv"), show_col_types = FALSE)
schemes <- read_csv(file.path(base_dir, "schemes_long.csv"), show_col_types = FALSE)
techniques <- read_csv(file.path(base_dir, "techniques_long.csv"), show_col_types = FALSE)
pieces <- read_csv(file.path(base_dir, "piece_profiles.csv"), show_col_types = FALSE)
dir.create(file.path(base_dir, "outputs"), showWarnings = FALSE)

stopifnot(!anyDuplicated(fields$ID_CAMPO))
stopifnot(!anyDuplicated(pieces$ID_PIEZA))

schemes_primary <- schemes %>% filter(INCLUIR_PRIMARIO == 1)

# Bloque gráfico estable para el análisis del lenguaje.
# E26+ queda fuera hasta cerrar el catálogo.
graphic_codes <- paste0("E", 1:25)

freq_graphic <- schemes_primary %>%
  filter(ESQUEMA_ANALITICO %in% graphic_codes) %>%
  count(ESQUEMA_ANALITICO, name="n") %>% arrange(desc(n))

write_csv(freq_graphic, file.path(base_dir,"outputs","frecuencias_esquemas_graficos.csv"))
graphic_n3 <- freq_graphic %>% filter(n>=3) %>% pull(ESQUEMA_ANALITICO)
graphic_n5 <- freq_graphic %>% filter(n>=5) %>% pull(ESQUEMA_ANALITICO)

safe_ca <- function(df,row_var,schemes_keep,label){
  x <- df %>%
    filter(.data$ESQUEMA_ANALITICO %in% schemes_keep,
           !is.na(.data[[row_var]]), .data[[row_var]]!="") %>%
    count(.data[[row_var]],ESQUEMA_ANALITICO,name="n") %>%
    pivot_wider(names_from=ESQUEMA_ANALITICO,values_from=n,values_fill=0)
  rn <- x[[row_var]]
  m <- as.matrix(x[,-1,drop=FALSE]); rownames(m)<-rn
  m <- m[rowSums(m)>0,colSums(m)>0,drop=FALSE]
  if(nrow(m)<2 || ncol(m)<2) return(NULL)
  fit <- ca(m)
  png(file.path(base_dir,"outputs",paste0("CA_",label,".png")),
      width=1800,height=1500,res=220)
  plot(fit); dev.off()
  write.csv(m,file.path(base_dir,"outputs",paste0("tabla_",label,".csv")),
            fileEncoding="UTF-8",row.names=TRUE)
  fit
}

safe_ca(schemes_primary %>% filter(TIPO_FUENTE=="PIEZA_OBSERVADA"),
        "FORMA_ANALITICA",graphic_n3,"forma_esquema_N3")
safe_ca(schemes_primary,"SECTOR_ANALITICO",graphic_n3,"sector_esquema_N3")
safe_ca(schemes_primary,"CLASE_SIMETRIA",graphic_n3,"simetria_esquema_N3")

tech_scheme <- techniques %>%
  inner_join(schemes_primary %>%
               filter(ESQUEMA_ANALITICO %in% graphic_n3) %>%
               select(ID_CAMPO,ESQUEMA_ANALITICO),by="ID_CAMPO")
safe_ca(tech_scheme,"TECNICA",graphic_n3,"tecnica_esquema_grafico_N3")

cramers_v <- function(tab){
  cs <- suppressWarnings(chisq.test(tab,correct=FALSE))
  n <- sum(tab); k <- min(nrow(tab)-1,ncol(tab)-1)
  if(k<=0 || n==0) return(NA_real_)
  sqrt(unname(cs$statistic)/(n*k))
}
monte_carlo_test <- function(tab,B=9999){
  list(test=chisq.test(tab,simulate.p.value=TRUE,B=B),
       cramers_v=cramers_v(tab))
}

# Composición a nivel pieza: Jaccard + PCoA.
piece_scheme_cols <- intersect(graphic_n3,names(pieces))
X <- as.matrix(pieces[,piece_scheme_cols,drop=FALSE]); storage.mode(X)<-"numeric"
keep <- rowSums(X)>0
X2 <- X[keep,,drop=FALSE]; meta <- pieces[keep,,drop=FALSE]
d_jac <- vegdist(X2,method="jaccard",binary=TRUE)
pcoa <- cmdscale(d_jac,k=2,eig=TRUE)
ord <- data.frame(ID_PIEZA=meta$ID_PIEZA,Axis1=pcoa$points[,1],Axis2=pcoa$points[,2],
                  FORMA=meta$FORMA,SITIO=meta$SITIO,GRUPO=meta$GRUPO_COCCION_PINTURA)
write_csv(ord,file.path(base_dir,"outputs","PCoA_Jaccard_piezas.csv"))

p <- ggplot(ord,aes(Axis1,Axis2))+geom_point(aes(shape=FORMA),size=3)+
  theme_minimal(base_size=12)+labs(title="PCoA — composición de esquemas gráficos (Jaccard)")
ggsave(file.path(base_dir,"outputs","PCoA_Jaccard_piezas.png"),p,width=8,height=6,dpi=300)

# PERMANOVA solo para formas con al menos 3 piezas; siempre controlar dispersión.
valid_forms <- names(which(table(meta$FORMA)>=3))
sel <- meta$FORMA %in% valid_forms
if(sum(sel)>=6 && length(valid_forms)>=2){
  d_form <- vegdist(X2[sel,,drop=FALSE],method="jaccard",binary=TRUE)
  meta_form <- meta[sel,,drop=FALSE]
  bd <- betadisper(d_form,group=factor(meta_form$FORMA))
  capture.output(permutest(bd,permutations=9999),
                 file=file.path(base_dir,"outputs","betadisper_forma.txt"))
  capture.output(adonis2(d_form~FORMA,data=meta_form,permutations=9999),
                 file=file.path(base_dir,"outputs","PERMANOVA_forma.txt"))
}

# Coocurrencia a nivel pieza + Fisher + FDR.
binary_piece <- as.data.frame(X)
pairs <- combn(colnames(binary_piece),2,simplify=FALSE)
pair_results <- lapply(pairs,function(pr){
  a<-binary_piece[[pr[1]]]; b<-binary_piece[[pr[2]]]
  tab<-table(factor(a,levels=c(0,1)),factor(b,levels=c(0,1)))
  ft<-fisher.test(tab)
  data.frame(E1=pr[1],E2=pr[2],cooc=sum(a==1 & b==1),
             odds_ratio=unname(ft$estimate),p=ft$p.value)
}) %>% bind_rows() %>% mutate(p_fdr=p.adjust(p,method="BH"))
write_csv(pair_results,file.path(base_dir,"outputs","coocurrencia_fisher_piezas.csv"))

edges <- pair_results %>% filter(cooc>=2,is.finite(odds_ratio),odds_ratio>1)
if(nrow(edges)>0){
  g <- graph_from_data_frame(edges[,c("E1","E2","cooc")],directed=FALSE)
  E(g)$weight <- edges$cooc
  png(file.path(base_dir,"outputs","red_coocurrencia_esquemas.png"),
      width=1800,height=1500,res=220)
  plot(g,vertex.size=24,vertex.label.cex=.9,edge.width=1+E(g)$weight/2)
  dev.off()
}

# Sensibilidad.
safe_ca(schemes_primary %>% filter(TIPO_FUENTE=="PIEZA_OBSERVADA"),
        "FORMA_ANALITICA",graphic_n5,"forma_esquema_N5")
safe_ca(schemes_primary,"FORMA_ANALITICA",graphic_n3,
        "forma_esquema_con_referencias_N3")

capture.output(sessionInfo(),file=file.path(base_dir,"outputs","sessionInfo.txt"))
